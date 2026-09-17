' Spent launcher. Runs node + next start without a visible console window,
' and keeps it running.
'
' wscript.exe is a GUI-subsystem host (no console attached), and WshShell.Run
' with intWindowStyle=0 + bWaitOnReturn=True keeps wscript alive as the parent
' so Task Scheduler can manage the lifecycle through its Job Object.
'
' Why the loop: Run returns the child's exit code, and wscript would otherwise
' exit 0 straight after - which Task Scheduler reads as SUCCESS, so its
' RestartOnFailure never fires and the app stays dead until the next logon.
' A server that quits at 2am should be back before anyone notices, so the
' restart is handled here rather than left to the scheduler.
'
' Backoff exists so a genuinely broken install (a bad build, a missing
' dependency) does not spin hot forever: the delay grows to a minute, and the
' loop gives up after enough consecutive fast failures. A process that ran
' fine for a while resets the counter, because that is a crash, not a broken
' install.
Option Explicit

Dim shell, exitCode, startedAt, ranFor, failures, waitSeconds

Const HEALTHY_RUN_SECONDS = 60   ' ran at least this long => a crash, not a bad install
Const MAX_FAST_FAILURES   = 10   ' consecutive quick exits before giving up

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "{{repoRoot}}"
failures = 0

Do
  startedAt = Timer
  exitCode = shell.Run("""{{nodePath}}"" ""{{repoRoot}}\node_modules\next\dist\bin\next"" start -H 127.0.0.1 -p {{port}}", 0, True)

  ' Timer resets at midnight; treat a negative span as a long, healthy run.
  ranFor = Timer - startedAt
  If ranFor < 0 Then ranFor = HEALTHY_RUN_SECONDS + 1

  If ranFor >= HEALTHY_RUN_SECONDS Then
    failures = 0
    waitSeconds = 2
  Else
    failures = failures + 1
    ' 5s, 10s, 20s, 40s, then a minute between attempts.
    waitSeconds = 5 * (2 ^ (failures - 1))
    If waitSeconds > 60 Then waitSeconds = 60
  End If

  If failures >= MAX_FAST_FAILURES Then Exit Do

  WScript.Sleep waitSeconds * 1000
Loop

Set shell = Nothing
' Non-zero tells Task Scheduler this really did fail, so its own
' RestartOnFailure gets a turn as a last resort.
WScript.Quit 1
