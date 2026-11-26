// clapd: the clap listener of the clap-whip mod.
//
// One copy runs per Claude session. Only one of them (the "owner") opens the
// microphone; when it hears a clap it tells every other copy, so each session
// cracks its whip while the microphone is opened just once.
//
// Lines written to stdout, one per event:
//   READY on|off   started; whether clap listening is switched on
//   ON / OFF       the switch changed (from any session)
//   MIC            this copy now holds the microphone
//   CLAP owner     a clap was heard, and this copy holds the microphone
//   CLAP           a clap was heard by another copy
//   DENIED         macOS refused microphone access
//   DUPLICATE      another copy already serves this session; this one exits
//   ERR <text>     something failed

import AVFoundation
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

func out(_ line: String) {
  print(line)
  fflush(stdout)
}

// MARK: - Clap detection

/// Finds claps in a stream of samples: a loud, broadband burst that starts
/// abruptly and is nearly gone a tenth of a second later.
struct ClapDetector {
  let frameLength: Int
  var threshold: Float

  private var count = 0
  private var peak: Float = 0
  private var sumSquares: Float = 0
  private var crossings = 0
  private var lastSample: Float = 0

  private var floor: Float = 0.004
  private var recent: [Float] = []
  private var frameIndex = 0
  private var onsetFrame = -1
  private var onsetRms: Float = 0
  private var tailSum: Float = 0
  private var tailCount = 0
  private var quietUntil = 0

  init(sampleRate: Double, threshold: Float) {
    frameLength = max(32, Int(sampleRate * 0.005))
    self.threshold = threshold
  }

  /// Feeds one sample; true when a clap has just been confirmed.
  mutating func feed(_ sample: Float) -> Bool {
    let magnitude = abs(sample)
    if magnitude > peak { peak = magnitude }
    sumSquares += sample * sample
    if (sample >= 0) != (lastSample >= 0) { crossings += 1 }
    lastSample = sample
    count += 1
    if count < frameLength { return false }
    return endFrame()
  }

  private mutating func endFrame() -> Bool {
    let rms = (sumSquares / Float(count)).squareRoot()
    let crossingRate = Float(crossings) / Float(count)
    let framePeak = peak
    count = 0
    peak = 0
    sumSquares = 0
    crossings = 0
    defer {
      recent.append(rms)
      if recent.count > 6 { recent.removeFirst() }
      frameIndex += 1
    }

    if onsetFrame >= 0 {
      let age = frameIndex - onsetFrame
      if age <= 4, rms > onsetRms { onsetRms = rms }
      if age >= 20, age < 32 {
        tailSum += rms
        tailCount += 1
      }
      if age == 32 {
        let tail = tailSum / Float(max(1, tailCount))
        onsetFrame = -1
        if tail <= 0.3 * onsetRms {
          // Deaf for 0.7 s: long enough not to hear the whip sound this clap sets off.
          quietUntil = frameIndex + 140
          return true
        }
      }
      return false
    }

    if frameIndex < quietUntil { return false }

    let before = max(recent.dropLast().max() ?? 0, 0.0005)
    let isLoud = framePeak >= threshold && rms >= max(0.03, 6 * floor)
    let isSudden = rms >= 3 * before
    let isBroadband = crossingRate >= 0.03
    if isLoud, isSudden, isBroadband {
      onsetFrame = frameIndex
      onsetRms = rms
      tailSum = 0
      tailCount = 0
      return false
    }

    floor = floor * 0.98 + rms * 0.02
    return false
  }
}

/// Sensitivity 1 (only very loud claps) to 10 (soft claps): the peak a clap must reach.
func threshold(forSensitivity level: Int) -> Float {
  let clamped = Float(min(10, max(1, level)))
  return 0.6 * powf(0.8, clamped - 1)
}

// MARK: - Files and signals shared by every copy

let stateDir = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent(".claude/clap-whip")
try? FileManager.default.createDirectory(at: stateDir, withIntermediateDirectories: true)
let offPath = stateDir.appendingPathComponent("off").path
let sensitivityPath = stateDir.appendingPathComponent("sensitivity").path
let clapSignal = Notification.Name("clap-whip.clap")
let configSignal = Notification.Name("clap-whip.config")
let center = DistributedNotificationCenter.default()
let myId = String(getpid())

func isSwitchedOn() -> Bool {
  !FileManager.default.fileExists(atPath: offPath)
}

func storedSensitivity() -> Int {
  guard let text = try? String(contentsOfFile: sensitivityPath, encoding: .utf8),
    let level = Int(text.trimmingCharacters(in: .whitespacesAndNewlines))
  else { return 4 }
  return min(10, max(1, level))
}

func post(_ name: Notification.Name) {
  center.postNotificationName(name, object: myId, userInfo: nil, deliverImmediately: true)
}

/// Takes an exclusive lock on a file in the state folder; nil when another process holds it.
func lock(_ name: String) -> Int32? {
  let fd = open(stateDir.appendingPathComponent(name).path, O_CREAT | O_RDWR, 0o644)
  if fd < 0 { return nil }
  if flock(fd, LOCK_EX | LOCK_NB) == 0 { return fd }
  close(fd)
  return nil
}

// MARK: - One-shot commands

let arguments = Array(CommandLine.arguments.dropFirst())

func value(after flag: String) -> String? {
  guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else { return nil }
  return arguments[index + 1]
}

func noise(_ seed: inout UInt64) -> Float {
  seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
  return Float(Int64(bitPattern: seed) >> 40) / Float(1 << 23)
}

func selfTest() -> Never {
  let rate = 48000.0
  var seed: UInt64 = 42
  func silence(_ seconds: Double) -> [Float] {
    (0..<Int(rate * seconds)).map { _ in noise(&seed) * 0.002 }
  }
  func burst(amplitude: Float, decay: Double, seconds: Double) -> [Float] {
    (0..<Int(rate * seconds)).map { i in
      noise(&seed) * amplitude * Float(exp(-Double(i) / rate / decay))
    }
  }
  func tone(hz: Double, amplitude: Float, attack: Double, seconds: Double) -> [Float] {
    (0..<Int(rate * seconds)).map { i in
      let t = Double(i) / rate
      let envelope = Float(min(1, t / attack) * min(1, (seconds - t) / attack))
      let wave = sin(2 * .pi * hz * t) + 0.5 * sin(2 * .pi * hz * 2 * t) + 0.3 * sin(2 * .pi * hz * 3 * t)
      return Float(wave) * 0.55 * amplitude * envelope
    }
  }
  let clap = burst(amplitude: 0.9, decay: 0.012, seconds: 0.3)
  let softClap = burst(amplitude: 0.45, decay: 0.02, seconds: 0.3)
  let cases: [(String, [Float], Int)] = [
    ("one clap", silence(0.5) + clap + silence(1), 1),
    ("softer clap in a roomy space", silence(0.5) + softClap + silence(1), 1),
    ("two claps two seconds apart", silence(0.5) + clap + silence(1.7) + clap + silence(1), 2),
    ("two claps a second apart", silence(0.5) + clap + silence(0.7) + clap + silence(1), 2),
    ("an echo right after a clap counts once", silence(0.5) + clap + silence(0.1) + clap + silence(1), 1),
    ("speech-like tone", silence(0.5) + tone(hz: 180, amplitude: 1, attack: 0.05, seconds: 0.5) + silence(1), 0),
    ("shout with a hard start", silence(0.5) + tone(hz: 300, amplitude: 1.2, attack: 0.002, seconds: 0.6) + silence(1), 0),
    ("key press", silence(0.5) + burst(amplitude: 0.12, decay: 0.006, seconds: 0.2) + silence(1), 0),
    ("desk thump", silence(0.5) + tone(hz: 70, amplitude: 1.4, attack: 0.001, seconds: 0.12) + silence(1), 0),
    ("music starting", silence(0.5) + burst(amplitude: 0.7, decay: 5, seconds: 1.5) + silence(1), 0),
    ("quiet room", silence(3), 0),
  ]
  var failures = 0
  for (name, samples, expected) in cases {
    var detector = ClapDetector(sampleRate: rate, threshold: threshold(forSensitivity: 4))
    var heard = 0
    for sample in samples where detector.feed(sample) { heard += 1 }
    let verdict = heard == expected ? "ok  " : "FAIL"
    if heard != expected { failures += 1 }
    print("\(verdict) \(name): heard \(heard), expected \(expected)")
  }
  exit(failures == 0 ? 0 : 1)
}

if arguments.contains("--selftest") { selfTest() }

if let setting = value(after: "--set") {
  if setting == "off" {
    FileManager.default.createFile(atPath: offPath, contents: nil)
  } else {
    try? FileManager.default.removeItem(atPath: offPath)
  }
  post(configSignal)
  out(isSwitchedOn() ? "ON" : "OFF")
  exit(0)
}

if let level = value(after: "--set-sensitivity") {
  let clamped = min(10, max(1, Int(level) ?? 4))
  try? String(clamped).write(toFile: sensitivityPath, atomically: true, encoding: .utf8)
  post(configSignal)
  out("SENSITIVITY \(clamped)")
  exit(0)
}

if arguments.contains("--trigger") {
  post(clapSignal)
  exit(0)
}

// MARK: - The listener

let isLevelMeter = arguments.contains("--levels")
// Without a session id, the process that started this copy stands for the session.
let sessionId = (value(after: "--session") ?? "pid-\(getppid())").filter { $0.isLetter || $0.isNumber || $0 == "-" }

// One copy per session: a second one (the same mod loaded twice) bows out.
// An earlier copy being replaced needs a moment to let go, so wait briefly.
var sessionLock: Int32?
if !isLevelMeter {
  for _ in 0..<40 {
    sessionLock = lock("session-\(sessionId).lock")
    if sessionLock != nil { break }
    usleep(100_000)
  }
  if sessionLock == nil {
    out("DUPLICATE")
    exit(0)
  }
}

final class Listener {
  private let engine = AVAudioEngine()
  private var detector = ClapDetector(sampleRate: 48000, threshold: 0.3)
  private var isRunning = false
  private var micLock: Int32?
  private var hasReportedDenied = false
  private var levelPeak: Float = 0
  private var levelCount = 0

  var isOwner: Bool { micLock != nil }

  /// Tries to become the one copy that holds the microphone.
  func claimMicrophone() {
    if micLock == nil {
      micLock = lock("mic.lock")
      if micLock != nil { apply() }
    }
  }

  /// Starts or stops listening to match the on/off switch.
  func apply() {
    guard isOwner || isLevelMeter else { return }
    if isSwitchedOn() || isLevelMeter {
      authorizeThenStart()
    } else {
      stop()
    }
  }

  private func authorizeThenStart() {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
      start()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .audio) { isGranted in
        DispatchQueue.main.async {
          if isGranted { self.start() } else { self.reportDenied() }
        }
      }
    default:
      reportDenied()
    }
  }

  private func reportDenied() {
    if !hasReportedDenied {
      hasReportedDenied = true
      out("DENIED")
    }
  }

  private func start() {
    if isRunning { stop() }
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      out("ERR no microphone found")
      return
    }
    detector = ClapDetector(
      sampleRate: format.sampleRate, threshold: threshold(forSensitivity: storedSensitivity()))
    let rate = format.sampleRate
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      guard let self, let channel = buffer.floatChannelData?[0] else { return }
      for index in 0..<Int(buffer.frameLength) {
        let sample = channel[index]
        if isLevelMeter {
          self.levelPeak = max(self.levelPeak, abs(sample))
          self.levelCount += 1
          if Double(self.levelCount) >= rate * 0.25 {
            out(String(format: "LEVEL %.3f", self.levelPeak))
            self.levelPeak = 0
            self.levelCount = 0
          }
        }
        if self.detector.feed(sample) {
          out("CLAP owner")
          post(clapSignal)
        }
      }
    }
    do {
      try engine.start()
      isRunning = true
      hasReportedDenied = false
      out("MIC")
    } catch {
      input.removeTap(onBus: 0)
      out("ERR \(error.localizedDescription)")
    }
  }

  func stop() {
    guard isRunning else { return }
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    isRunning = false
  }

  /// The audio device changed (headphones plugged in, a new microphone): start over on it.
  func restart() {
    if isRunning {
      stop()
      apply()
    }
  }
}

let listener = Listener()

center.addObserver(forName: clapSignal, object: nil, queue: .main) { note in
  if (note.object as? String) == myId { return }
  out(listener.isOwner ? "CLAP owner" : "CLAP")
}

center.addObserver(forName: configSignal, object: nil, queue: .main) { _ in
  out(isSwitchedOn() ? "ON" : "OFF")
  listener.stop()
  listener.apply()
}

NotificationCenter.default.addObserver(
  forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main
) { _ in
  listener.restart()
}

out("READY \(isSwitchedOn() ? "on" : "off")")

if isLevelMeter {
  listener.apply()
  DispatchQueue.main.asyncAfter(deadline: .now() + (Double(value(after: "--levels") ?? "") ?? 3)) {
    exit(0)
  }
} else {
  listener.claimMicrophone()
}

// Every two seconds: leave when the session that started this copy is gone,
// and take the microphone over when the copy that held it has left.
let parent = getppid()
let housekeeping = DispatchSource.makeTimerSource(queue: .main)
housekeeping.schedule(deadline: .now() + 2, repeating: 2)
housekeeping.setEventHandler {
  if getppid() != parent { exit(0) }
  if !isLevelMeter { listener.claimMicrophone() }
}
housekeeping.resume()

RunLoop.main.run()
