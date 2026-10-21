// Portable single-file wrapper for the jpackage FreeRouting app image.
//
// The FreeRouting engine is a directory (launcher + app/freerouting.jar +
// runtime/jre), which cannot be shipped as one file. This stub embeds that
// directory as a ZIP payload, unpacks it once into a per-version cache and then
// becomes a transparent proxy: every argument is forwarded verbatim, stdout and
// stderr stay attached to the caller, and the child's exit code is returned.
//
// The child is placed in a kill-on-close job object, so killing this process
// (the PID the DSH plugin owns) also kills the JVM instead of orphaning it.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class Program
{
    private const int SwHide = 0;
    private const uint JobObjectLimitKillOnJobClose = 0x2000;
    private const int JobObjectExtendedLimitInformationClass = 9;

    private const string PayloadResource = "payload.zip";
    private const string ReadyMarkerName = ".ready";
    private const string EngineRelativePath = @"FreeRouting\FreeRouting.exe";
    private const string EngineDirectory = "FreeRouting";

    private static int Main(string[] args)
    {
        try
        {
            string engineExe = EnsureEngine();
            if (engineExe == null)
            {
                return 1;
            }
            return Run(engineExe, args);
        }
        catch (Exception error)
        {
            // A wrapper failure must be visible on the caller's stderr.
            Console.Error.WriteLine("freerouting: " + error.Message);
            return 1;
        }
    }

    /// <summary>Extracts the payload once per version and returns the engine exe path.</summary>
    private static string EnsureEngine()
    {
        string root = CacheRoot();
        string engineExe = Path.Combine(root, EngineRelativePath);
        if (IsReady(root, engineExe))
        {
            return engineExe;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(root));
        using (var mutex = new Mutex(false, @"Local\FreeroutingEngine-" + PayloadInfo.Tag))
        {
            if (!mutex.WaitOne(TimeSpan.FromMinutes(10)))
            {
                throw new IOException("timed out waiting for another extraction to finish");
            }
            try
            {
                if (IsReady(root, engineExe))
                {
                    return engineExe;
                }
                Extract(root);
            }
            finally
            {
                mutex.ReleaseMutex();
            }
        }
        if (!IsReady(root, engineExe))
        {
            throw new IOException("payload extraction did not produce " + engineExe);
        }
        return engineExe;
    }

    private static bool IsReady(string root, string engineExe)
    {
        return File.Exists(Path.Combine(root, ReadyMarkerName)) && File.Exists(engineExe);
    }

    private static string CacheRoot()
    {
        string overridden = Environment.GetEnvironmentVariable("FREEROUTING_ENGINE_HOME");
        if (!string.IsNullOrEmpty(overridden))
        {
            return Path.Combine(overridden, PayloadInfo.Tag);
        }
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(localAppData, "FreeRouting", "engine", PayloadInfo.Tag);
    }

    /// <summary>Unpacks into a sibling temp directory, then renames it into place.</summary>
    private static void Extract(string root)
    {
        string staging = root + ".tmp-" + Process.GetCurrentProcess().Id;
        if (Directory.Exists(staging))
        {
            Directory.Delete(staging, true);
        }
        Directory.CreateDirectory(staging);

        Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadResource);
        if (payload == null)
        {
            throw new IOException("embedded payload missing");
        }
        using (payload)
        using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string target = Path.GetFullPath(Path.Combine(staging, entry.FullName));
                if (!target.StartsWith(Path.GetFullPath(staging), StringComparison.OrdinalIgnoreCase))
                {
                    throw new IOException("payload entry escapes the target directory: " + entry.FullName);
                }
                if (entry.Name.Length == 0)
                {
                    Directory.CreateDirectory(target);
                    continue;
                }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                entry.ExtractToFile(target, true);
            }
        }

        File.WriteAllText(
            Path.Combine(staging, ReadyMarkerName),
            PayloadInfo.Tag + Environment.NewLine + PayloadInfo.ZipSha256 + Environment.NewLine,
            Encoding.ASCII);

        if (Directory.Exists(root))
        {
            Directory.Delete(root, true);
        }
        Directory.Move(staging, root);
    }

    /// <summary>Runs the engine, forwarding arguments, console handles and exit code.</summary>
    private static int Run(string engineExe, string[] args)
    {
        var startInfo = new ProcessStartInfo(engineExe)
        {
            WorkingDirectory = Path.GetDirectoryName(engineExe),
            UseShellExecute = false,
        };
        startInfo.Arguments = BuildCommandLine(args);

        // A console window created just for this wrapper (double-click) is noise;
        // hide it once, before the Swing UI appears. When started from a shell or
        // from a pipe there is either a shared console or no console at all.
        HideOwnConsole();

        using (Process child = Process.Start(startInfo))
        {
            if (child == null)
            {
                return 1;
            }
            TryKillWithWrapper(child);
            child.WaitForExit();
            return child.ExitCode;
        }
    }

    private static void HideOwnConsole()
    {
        IntPtr console = GetConsoleWindow();
        if (console == IntPtr.Zero)
        {
            return;
        }
        var processes = new uint[8];
        if (GetConsoleProcessList(processes, (uint)processes.Length) <= 1)
        {
            ShowWindow(console, SwHide);
        }
    }

    /// <summary>Windows command-line quoting (CommandLineToArgvW rules).</summary>
    private static string BuildCommandLine(string[] args)
    {
        var builder = new StringBuilder();
        foreach (string argument in args)
        {
            if (builder.Length > 0)
            {
                builder.Append(' ');
            }
            builder.Append(Quote(argument));
        }
        return builder.ToString();
    }

    private static string Quote(string argument)
    {
        if (argument.Length > 0 && argument.IndexOfAny(new[] { ' ', '\t', '"', '\n', '\v' }) < 0)
        {
            return argument;
        }
        var quoted = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char current in argument)
        {
            if (current == '\\')
            {
                backslashes++;
                continue;
            }
            if (current == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
            }
            else
            {
                quoted.Append('\\', backslashes);
                quoted.Append(current);
            }
            backslashes = 0;
        }
        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    /// <summary>Best effort: never let a failed job assignment break the launch.</summary>
    private static void TryKillWithWrapper(Process child)
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero)
        {
            return;
        }
        var limits = new JobObjectExtendedLimitInformation();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        int size = Marshal.SizeOf(typeof(JobObjectExtendedLimitInformation));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, buffer, false);
            if (SetInformationJobObject(job, JobObjectExtendedLimitInformationClass, buffer, (uint)size))
            {
                AssignProcessToJobObject(job, child.Handle);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
        // The handle stays open for the life of this process; closing it (on exit)
        // terminates the job, which is exactly the kill-on-close contract.
        GC.KeepAlive(job);
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr securityAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint GetConsoleProcessList(uint[] processList, uint processCount);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectBasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectExtendedLimitInformation
    {
        public JobObjectBasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }
}
