$token = gcloud auth print-access-token
$project = "project-f72e4c83-5347-45b1-bb2"
$location = "us-central1"  # Región principal
$model = "gemini-2.5-flash"

$url = "https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent"

$body = @{
    contents = @(
        @{
            role = "user"
            parts = @(
                @{ text = "Di solo 'ok'" }
            )
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Testing Vertex AI REST API..." -ForegroundColor Cyan
Write-Host "URL: $url" -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    } -Body $body
    
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 5)
} catch {
    Write-Host "ERROR:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    Write-Host $_.ErrorDetails.Message
}
