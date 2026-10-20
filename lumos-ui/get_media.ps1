[void][System.Reflection.Assembly]::LoadWithPartialName("System.Runtime.WindowsRuntime")
$asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' }
$asTaskGeneric = $asTaskMethods | Where-Object { 
    $params = $_.GetParameters()
    $params.Count -eq 1 -and $params[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await-WinRt {
    param ($WinRtTask, [Type] $ResultType)
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSession, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null

while ($true) {
    try {
        $managerOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
        $manager = Await-WinRt -WinRtTask $managerOp -ResultType ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

        if ($manager) {
            $allSessions = $manager.GetSessions()
            $activeSession = $null
            foreach ($session in $allSessions) {
                $playback = $session.GetPlaybackInfo()
                if ($playback.PlaybackStatus -eq 4) { # Playing
                    $activeSession = $session
                    break
                }
            }
            if (-not $activeSession) {
                $activeSession = $manager.GetCurrentSession()
            }
            if (-not $activeSession -and $allSessions.Count -gt 0) {
                $activeSession = $allSessions[0]
            }
            
            if ($activeSession) {
                $playbackInfo = $activeSession.GetPlaybackInfo()
                $isPlaying = ($playbackInfo.PlaybackStatus -eq 4)

                $propsOp = $activeSession.TryGetMediaPropertiesAsync()
                $props = Await-WinRt -WinRtTask $propsOp -ResultType ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                if ($props) {
                    $out = @{
                        title = if ($props.Title) { $props.Title } else { "" }
                        artist = if ($props.Artist) { $props.Artist } else { "" }
                        isPlaying = $isPlaying
                    }
                    $out | ConvertTo-Json -Compress
                } else {
                    Write-Output '{"title":"","artist":"","isPlaying":false}'
                }
            } else {
                Write-Output '{"title":"","artist":"","isPlaying":false}'
            }
        } else {
            Write-Output '{"title":"","artist":"","isPlaying":false}'
        }
    } catch {
        Write-Output '{"title":"","artist":"","isPlaying":false}'
    }
    
    Start-Sleep -Seconds 2
}
