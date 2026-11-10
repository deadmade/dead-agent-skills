---
name: core
description: "C#/.NET only. C# language semantics and refactoring, runtime diagnostics and performance, .NET 11 APIs, advanced scenarios, AI/LLM integration in .NET. Index of Microsoft's .NET skills for these."
paths:
  - "**/*.cs"
  - "**/*.csproj"
  - "**/*.sln"
  - "**/*.slnx"
  - "**/*.props"
  - "**/*.targets"
  - "**/*.razor"
  - "**/*.xaml"
  - "**/global.json"
---

# C#/.NET skills: core

Microsoft's .NET skills for this area (vendored from dotnet/skills). Pick the one that matches the task, read its
SKILL.md with the host file-reading tool, and follow it. When a skill names another skill, read
`../../library/<that-name>/SKILL.md`.

| Skill | Use for | Path |
| --- | --- | --- |
| analyzing-dotnet-performance | Scans .NET code for ~50 performance anti-patterns across async, memory, strings, collections, LINQ, regex, serialization, and I/O with tiered severity classification. | `../../library/analyzing-dotnet-performance/SKILL.md` |
| android-tombstone-symbolication | Symbolicate the .NET runtime frames in an Android tombstone file. | `../../library/android-tombstone-symbolication/SKILL.md` |
| apple-crash-symbolication | Symbolicate .NET runtime frames in Apple platform .ips crash logs (iOS, tvOS, Mac Catalyst, macOS). | `../../library/apple-crash-symbolication/SKILL.md` |
| clr-activation-debugging | Diagnoses .NET Framework CLR activation issues using CLR activation logs (CLRLoad logs) produced by mscoree.dll. | `../../library/clr-activation-debugging/SKILL.md` |
| csharp-expert | C# semantics, and routing to the right specialist skill in this plugin. | `../../library/csharp-expert/SKILL.md` |
| csharp-refactoring | Safely refactors C#/.NET code without changing behavior. | `../../library/csharp-refactoring/SKILL.md` |
| csharp-scripts | Run file-based C# apps with the .NET CLI when the user explicitly wants C#/.NET code without creating a project. | `../../library/csharp-scripts/SKILL.md` |
| dotnet-breaking-changes | Use before changing .NET/C# code whose callers you do not control: a NuGet library, or a repo with PublicAPI.Shipped/Unshipped.txt, ApiCompat, multiple TargetFrameworks, InternalsVisibleTo, or… | `../../library/dotnet-breaking-changes/SKILL.md` |
| dotnet-pinvoke | Correctly call native (C/C++) libraries from .NET using P/Invoke and LibraryImport. | `../../library/dotnet-pinvoke/SKILL.md` |
| dotnet-trace-collect | Guide developers through capturing diagnostic artifacts to diagnose production .NET performance issues. | `../../library/dotnet-trace-collect/SKILL.md` |
| dump-collect | Configure and collect crash dumps for modern .NET applications. | `../../library/dump-collect/SKILL.md` |
| microbenchmarking | Activate this skill when BenchmarkDotNet (BDN) is involved in the task — creating, running, configuring, or reviewing BDN benchmarks. | `../../library/microbenchmarking/SKILL.md` |
| msbuild | Use before MSBuild custom-target or incremental-generation repairs, XML/import/hook review, .binlog capture/replay, or assessing supported/unsupported build-speedup claims and controlled timings, even… | `../../library/msbuild/SKILL.md` |
| nuget-trusted-publishing | Set up NuGet trusted publishing (OIDC) on a GitHub Actions repo — replaces long-lived API keys with short-lived tokens. | `../../library/nuget-trusted-publishing/SKILL.md` |
| process-api-net11 | Provides guidance on the new System.Diagnostics.Process APIs introduced in .NET 11: Process.Run, Process.RunAndCaptureText, Process.StartAndForget, Process.ReadAllText/Bytes/Lines, KillOnParentExit,… | `../../library/process-api-net11/SKILL.md` |
| setup-local-sdk | Install a .NET SDK locally for safe preview testing, specific-version pinning, or reproducible team setups — without modifying the system-wide installation. | `../../library/setup-local-sdk/SKILL.md` |
| system-text-json-net11 | Imperative guidance for the System.Text.Json APIs added in .NET 11: the built-in `JsonNamingPolicy.PascalCase` naming policy, and the strongly-typed generic `JsonSerializerOptions.GetTypeInfo` and… | `../../library/system-text-json-net11/SKILL.md` |
| technology-selection | Guides technology selection and implementation of AI and ML features in .NET 8+ applications using ML.NET, Microsoft.Extensions.AI (MEAI), Microsoft Agent Framework (MAF), GitHub Copilot SDK, ONNX… | `../../library/technology-selection/SKILL.md` |
| vectorization | Design, implement, optimize, and review SIMD code in .NET. | `../../library/vectorization/SKILL.md` |
