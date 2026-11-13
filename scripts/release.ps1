[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Version,

    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "版本号必须是 major.minor.patch 格式，例如 1.0.0"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Set-VersionInFile {
    param(
        [string]$RelativePath,
        [string]$Pattern,
        [string]$Replacement,
        [int]$Count = 1
    )

    $path = Join-Path $repoRoot $RelativePath
    $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
    $updated = [regex]::new($Pattern).Replace($text, $Replacement, $Count)
    if ($updated -eq $text) {
        Write-Host "$RelativePath 已是 $Version"
        return $false
    }

    [IO.File]::WriteAllText($path, $updated, [Text.UTF8Encoding]::new($false))
    Write-Host "$RelativePath 已更新为 $Version"
    return $true
}

Push-Location $repoRoot
try {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -ne 'master') {
        throw "当前分支是 $branch，请在 master 分支上发版"
    }

    if (git status --porcelain) {
        throw "工作区有未提交的改动，请先提交或暂存后再发版"
    }

    $tag = "v$Version"
    git rev-parse -q --verify "refs/tags/$tag" *> $null
    if ($LASTEXITCODE -eq 0) {
        throw "本地已存在 tag $tag"
    }
    $remoteTag = git ls-remote --tags origin "refs/tags/$tag"
    if ($remoteTag) {
        throw "远端已存在 tag $tag"
    }

    $quoteVersion = '${1}' + $Version + '${2}'
    $changed = $false

    if (Set-VersionInFile 'package.json' '(?m)^(\s*"version":\s*")[^"]+(")' $quoteVersion) {
        $changed = $true
    }
    if (Set-VersionInFile 'package-lock.json' '(?m)^(\s*"version":\s*")[^"]+(")' $quoteVersion 2) {
        $changed = $true
    }
    if (Set-VersionInFile 'src-tauri/Cargo.toml' '(?m)^version = "[^"]+"' "version = `"$Version`"") {
        $changed = $true
    }
    if (Set-VersionInFile 'src-tauri/Cargo.lock' '(?m)(name = "tts-aggregator-desktop"\r?\nversion = ")[^"]+(")' $quoteVersion) {
        $changed = $true
    }
    if (Set-VersionInFile 'src-tauri/tauri.conf.json' '(?m)^(\s*"version":\s*")[^"]+(")' $quoteVersion) {
        $changed = $true
    }

    $pkg = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
    if ($pkg.version -ne $Version) {
        throw "package.json 版本校验失败，期望 $Version，实际 $($pkg.version)"
    }

    if ($changed) {
        git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
        git --no-pager diff --cached --stat
        git commit -m "chore: 发布 $tag"
    }
    else {
        Write-Host "版本号已经是 $Version，跳过版本提交"
    }

    git tag -a $tag -m "TTS Aggregator $tag"

    if ($NoPush) {
        Write-Host "已在本地提交并打 tag $tag，未推送"
        Write-Host "手动推送：git push origin master; git push origin $tag"
        return
    }

    git push origin master
    git push origin $tag

    Write-Host ""
    Write-Host "已推送 $tag，GitHub Actions 正在构建并发布："
    Write-Host "https://github.com/ACG-Q/tts-aggregator-desktop/actions"
    Write-Host "发布页：https://github.com/ACG-Q/tts-aggregator-desktop/releases/tag/$tag"
}
finally {
    Pop-Location
}
