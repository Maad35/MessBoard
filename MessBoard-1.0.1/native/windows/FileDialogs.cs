// Common Item Dialog COM backend, .NET Framework / Windows PowerShell 5.1.
// References: learn.microsoft.com/windows/win32/shell/common-file-dialog
// COM slots below match shobjidl_core.h; no legacy OFN/FolderBrowserDialog fallback.
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

namespace MessBoard.NativeDialogs {
    public sealed class Request {
        public int version { get; set; }
        public string operation { get; set; }
        public string title { get; set; }
        public string initial { get; set; }
        public string name { get; set; }
        public string[] extensions { get; set; }
        public string selectedFilter { get; set; }
        public string confirm { get; set; }
        public string prompt { get; set; }
        public string source { get; set; }
        public bool multiple { get; set; }
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct Filter {
        [MarshalAs(UnmanagedType.LPWStr)] public string name;
        [MarshalAs(UnmanagedType.LPWStr)] public string spec;
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItem {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint sigdnName, out IntPtr name);
        void GetAttributes(uint mask, out uint attrs);
        void Compare(IShellItem item, uint hint, out int order);
    }
    [ComImport, Guid("B63EA76D-1F85-456F-A19C-48159EFA858B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItemArray {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
        void GetPropertyDescriptionList(IntPtr key, ref Guid riid, out IntPtr ppv);
        void GetAttributes(uint flags, uint mask, out uint attrs);
        void GetCount(out uint count);
        void GetItemAt(uint index, out IShellItem item);
        void EnumItems(out IntPtr enumerator);
    }
    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IFileDialog {
        [PreserveSig] int Show(IntPtr owner);
        void SetFileTypes(uint count, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex=0)] Filter[] filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetFolder(out IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName(out IntPtr name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, int location);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
    }
    [ComImport, Guid("D57C7288-D4AD-4768-BE02-9D969532D960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr owner);
        void SetFileTypes(uint count, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex=0)] Filter[] filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetFolder(out IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName(out IntPtr name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, int location);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
        void GetResults(out IShellItemArray items);
        void GetSelectedItems(out IShellItemArray items);
    }
    public static class Engine {
        // FOS_NOCHANGEDIR | FORCEFILESYSTEM | PATHMUSTEXIST | NOTESTFILECREATE |
        // DONTADDTORECENT: choosing a save path must not create a test file.
        const uint BaseOptions = 0x8 | 0x40 | 0x800 | 0x10000 | 0x2000000;
        const int ModalTimeoutMilliseconds = 240000;
        [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
        static extern void SHCreateItemFromParsingName(string path, IntPtr bind, ref Guid iid, out IShellItem item);
        [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=true)]
        static extern int SHParseDisplayName(string name, IntPtr bind, out IntPtr pidl, uint attributesIn, out uint attributesOut);
        [DllImport("shell32.dll", PreserveSig=true)]
        static extern int SHOpenFolderAndSelectItems(IntPtr folder, uint count, IntPtr[] children, uint flags);
        [DllImport("shell32.dll")]
        static extern IntPtr ILFindLastID(IntPtr pidl);
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1048576, RecursionLimit = 16 };
        static bool FileSystemPath(string path) {
            if (String.IsNullOrEmpty(path) || path.Length > 32767 || System.Text.RegularExpressions.Regex.IsMatch(path, @"[\x00-\x1f]")) return false;
            if (System.Text.RegularExpressions.Regex.IsMatch(path, @"^[\\/]{2}[.?][\\/]")) return false;
            return System.Text.RegularExpressions.Regex.IsMatch(path, @"^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+)");
        }
        static Request Parse(string input) {
            if (input == null || input.Length > 16000) throw new ArgumentException("input");
            Request r = Json.Deserialize<Request>(input);
            if (r == null || r.version != 1 || (r.operation != "save" && r.operation != "open" && r.operation != "folder" && r.operation != "reveal")) throw new ArgumentException("input");
            if (r.source == null) r.source = "";
            foreach (string s in new string[] { r.title, r.initial, r.name, r.selectedFilter, r.confirm, r.prompt, r.source }) {
                if (s == null || s.Length > 4096 || System.Text.RegularExpressions.Regex.IsMatch(s, "[\\x00-\\x1f]")) throw new ArgumentException("input");
            }
            if (r.initial.Length > 0 && !FileSystemPath(r.initial)) throw new ArgumentException("input");
            if (r.operation == "reveal" && (!FileSystemPath(r.source) || !System.IO.File.Exists(r.source))) throw new ArgumentException("input");
            if (r.operation != "reveal" && r.source.Length > 0) throw new ArgumentException("input");
            if (r.extensions == null || r.extensions.Length > 64 || (r.operation == "save" && r.multiple)) throw new ArgumentException("input");
            foreach (string ext in r.extensions) if (ext == null || ext.Length > 64 || !System.Text.RegularExpressions.Regex.IsMatch(ext, "^[a-zA-Z0-9]+(\\.[a-zA-Z0-9]+)*$")) throw new ArgumentException("input");
            return r;
        }
        static IFileDialog Configure(Request r) {
            Guid clsid = new Guid(r.operation == "save" ? "C0B4E2F3-BA21-4773-8DBA-335EC946EB8B" : "DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7");
            IFileDialog dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(clsid));
            try {
                uint flags = BaseOptions;
                if (r.operation == "save") flags |= 0x2; // FOS_OVERWRITEPROMPT
                else flags |= 0x1000; // FOS_FILEMUSTEXIST
                if (r.operation == "folder") flags |= 0x20; // FOS_PICKFOLDERS
                if (r.multiple) flags |= 0x200;
                dialog.SetOptions(flags);
                // Namespace persistent dialog state to MessBoard, not PowerShell.
                Guid client = new Guid("CE0C44BA-1D64-42A2-A817-892B794B890C");
                dialog.SetClientGuid(ref client);
                dialog.SetTitle(r.title);
                if (r.confirm.Length > 0) dialog.SetOkButtonLabel(r.confirm);
                if (r.prompt.Length > 0) dialog.SetFileNameLabel(r.prompt);
                if (r.name.Length > 0) dialog.SetFileName(r.name);
                if (r.operation != "folder" && r.extensions.Length > 0) {
                    // One combined type admits all image/legacy board formats.
                    string spec = "*." + String.Join(";*.", r.extensions);
                    dialog.SetFileTypes(1, new Filter[] { new Filter { name = "Supported files (" + spec + ")", spec = spec } });
                    dialog.SetFileTypeIndex(1);
                    if (r.operation == "save") dialog.SetDefaultExtension(r.extensions[0]);
                }
                if (r.initial.Length > 0 && System.IO.Directory.Exists(r.initial)) {
                    IShellItem folder = null;
                    try { Guid iid = typeof(IShellItem).GUID; SHCreateItemFromParsingName(r.initial, IntPtr.Zero, ref iid, out folder); dialog.SetFolder(folder); }
                    finally { Release(folder); }
                }
                return dialog;
            } catch { Release(dialog); throw; }
        }
        static void Release(object obj) { if (obj != null && Marshal.IsComObject(obj)) Marshal.FinalReleaseComObject(obj); }
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint command);
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder name, int count);
        delegate bool EnumProc(IntPtr hwnd, IntPtr param);
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
        [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hwnd, EnumProc callback, IntPtr param);
        [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
        static string WindowClass(IntPtr hwnd) { var b = new System.Text.StringBuilder(256); GetClassName(hwnd, b, b.Capacity); return b.ToString(); }
        static IntPtr HostOwner() {
            IntPtr hwnd = GetForegroundWindow();
            hwnd = GetAncestor(hwnd, 3); // GA_ROOTOWNER: floating CEP panel -> AE
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) throw new InvalidOperationException("owner");
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            using (var process = System.Diagnostics.Process.GetProcessById((int)pid)) {
                string name = process.ProcessName;
                if (!String.Equals(name, "AfterFX", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("owner");
            }
            // Never activate another AE instance or an unrelated foreground app.
            return hwnd;
        }
        public sealed class Probe {
            public string windowClass = "";
            public bool directUI, sameProcess, owned, cancelSent;
        }
        static string ItemPath(IShellItem item) {
            IntPtr value = IntPtr.Zero;
            try {
                item.GetDisplayName(0x80058000, out value); // SIGDN_FILESYSPATH
                string path = Marshal.PtrToStringUni(value);
                if (!FileSystemPath(path)) throw new InvalidOperationException("path");
                return path;
            } finally { if (value != IntPtr.Zero) Marshal.FreeCoTaskMem(value); }
        }
        // Retained for protocol completeness. The panel no longer routes
        // Windows reveal through this helper: repeated SHOpenFolderAndSelectItems
        // calls from a short-lived process can close the Explorer window they
        // opened and leave the file unrevealable until a reboot (field-audited
        // 2026-10-21), so source-location.js uses explorer.exe /select instead.
        static string Reveal(string path) {
            string parent = System.IO.Path.GetDirectoryName(path);
            if (!FileSystemPath(parent) || !System.IO.Directory.Exists(parent)) throw new InvalidOperationException("parent");
            IntPtr folderPidl = IntPtr.Zero, filePidl = IntPtr.Zero;
            try {
                uint ignored;
                int hr = SHParseDisplayName(parent, IntPtr.Zero, out folderPidl, 0, out ignored);
                if (hr != 0) Marshal.ThrowExceptionForHR(hr);
                hr = SHParseDisplayName(path, IntPtr.Zero, out filePidl, 0, out ignored);
                if (hr != 0) Marshal.ThrowExceptionForHR(hr);
                IntPtr child = ILFindLastID(filePidl);
                if (child == IntPtr.Zero) throw new InvalidOperationException("pidl");
                hr = SHOpenFolderAndSelectItems(folderPidl, 1, new IntPtr[] { child }, 0);
                if (hr != 0) Marshal.ThrowExceptionForHR(hr);
                return Json.Serialize(new { version = 1, status = "revealed", paths = new string[] { path }, backend = "SHOpenFolderAndSelectItems" });
            } finally {
                if (filePidl != IntPtr.Zero) Marshal.FreeCoTaskMem(filePidl);
                if (folderPidl != IntPtr.Zero) Marshal.FreeCoTaskMem(folderPidl);
            }
        }
        public static string Run(string input, bool probeCancel) {
            Request r = Parse(input);
            if (Thread.CurrentThread.GetApartmentState() != ApartmentState.STA) throw new InvalidOperationException("STA");
            if (r.operation == "reveal") return Reveal(r.source);
            // In probe mode all UI belongs to THIS disposable PowerShell process.
            System.Windows.Forms.Form probeOwner = null;
            System.Windows.Forms.Timer timer = null;
            System.Windows.Forms.Timer deadline = null;
            bool expired = false;
            Probe evidence = null;
            IFileDialog dialog = null;
            try {
                IntPtr owner;
                if (probeCancel) {
                    probeOwner = new System.Windows.Forms.Form();
                    probeOwner.ShowInTaskbar = false;
                    probeOwner.Text = "MessBoard isolated native dialog probe";
                    owner = probeOwner.Handle; // hidden owner, never attach to a user window
                    evidence = new Probe();
                } else owner = HostOwner();
                dialog = Configure(r);
                if (probeCancel) {
                    var elapsed = System.Diagnostics.Stopwatch.StartNew();
                    uint ownPid = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
                    timer = new System.Windows.Forms.Timer { Interval = 100 };
                    timer.Tick += delegate {
                        EnumWindows(delegate(IntPtr hwnd, IntPtr ignored) {
                            uint pid; GetWindowThreadProcessId(hwnd, out pid);
                            if (pid != ownPid || WindowClass(hwnd) != "#32770") return true;
                            evidence.windowClass = WindowClass(hwnd);
                            evidence.sameProcess = pid == ownPid;
                            evidence.owned = GetWindow(hwnd, 4) == owner; // GW_OWNER
                            EnumChildWindows(hwnd, delegate(IntPtr child, IntPtr p) {
                                if (WindowClass(child) == "DirectUIHWND") evidence.directUI = true;
                                return true;
                            }, IntPtr.Zero);
                            if (evidence.directUI || elapsed.ElapsedMilliseconds > 8000) {
                                // IDCANCEL only; never send keyboard input or click coordinates.
                                evidence.cancelSent = PostMessage(hwnd, 0x111, new IntPtr(2), IntPtr.Zero);
                                timer.Stop();
                            }
                            return false;
                        }, IntPtr.Zero);
                        if (elapsed.ElapsedMilliseconds > 10000) { timer.Stop(); dialog.Close(unchecked((int)0x800704C7)); }
                    };
                    timer.Start();
                }
                // Close normally first so Windows reenables the AE owner; process
                // timeout is only a last-resort crash/hang bound, not the modal timer.
                deadline = new System.Windows.Forms.Timer { Interval = ModalTimeoutMilliseconds };
                deadline.Tick += delegate { expired = true; deadline.Stop(); dialog.Close(unchecked((int)0x800704C7)); };
                deadline.Start();
                if (!probeCancel && HostOwner() != owner) throw new InvalidOperationException("owner changed");
                int hr = dialog.Show(owner);
                if (expired) throw new TimeoutException("dialog");
                if (hr == unchecked((int)0x800704C7)) return Json.Serialize(new { version = 1, status = "canceled", paths = new string[0], probe = evidence });
                if (hr != 0) Marshal.ThrowExceptionForHR(hr);
                if (probeCancel) throw new InvalidOperationException("probe unexpectedly accepted");
                var paths = new List<string>();
                if (r.operation == "save") {
                    IShellItem item = null;
                    try { dialog.GetResult(out item); paths.Add(ItemPath(item)); }
                    finally { Release(item); }
                } else {
                    IShellItemArray items = null;
                    try {
                        ((IFileOpenDialog)dialog).GetResults(out items);
                        uint count; items.GetCount(out count);
                        if (count == 0 || count > 1024 || (!r.multiple && count != 1)) throw new InvalidOperationException("count");
                        for (uint i = 0; i < count; i++) {
                            IShellItem item = null;
                            try { items.GetItemAt(i, out item); paths.Add(ItemPath(item)); }
                            finally { Release(item); }
                        }
                    } finally { Release(items); }
                }
                string result = Json.Serialize(new { version = 1, status = "chosen", paths = paths.ToArray() });
                if (System.Text.Encoding.UTF8.GetByteCount(result) > 1000000) throw new InvalidOperationException("size");
                return result;
            } finally {
                if (deadline != null) { deadline.Stop(); deadline.Dispose(); }
                if (timer != null) { timer.Stop(); timer.Dispose(); }
                Release(dialog);
                if (probeOwner != null) probeOwner.Dispose();
            }
        }
        public static string SelfTest(string input) {
            Request r = Parse(input);
            string roundTrip = "";
            if (r.initial.Length > 0) {
                IShellItem item = null;
                try { Guid iid = typeof(IShellItem).GUID; SHCreateItemFromParsingName(r.initial, IntPtr.Zero, ref iid, out item); roundTrip = ItemPath(item); }
                finally { Release(item); }
            }
            foreach (string operation in new string[] { "open", "save", "folder" }) {
                r.operation = operation;
                IFileDialog dialog = Configure(r);
                try { uint flags; dialog.GetOptions(out flags); if ((flags & BaseOptions) != BaseOptions) throw new Exception("options"); }
                finally { Release(dialog); }
            }
            return Json.Serialize(new { version = 1, status = "selftest", backend = "CommonItemDialog", apartment = Thread.CurrentThread.GetApartmentState().ToString(), configured = new string[] { "open", "save", "folder" }, transportTitle = r.title, filesystemRoundTrip = roundTrip, shown = false });
        }
        public static class Launcher {
            // Standalone entry point hosting the same engine without a PowerShell process;
            // a CLR-only exe starts far faster than powershell.exe plus its runspace.
            [STAThread]
            static int Main(string[] args) {
                // The PowerShell launcher pinned UTF-8; a bare CLR exe inherits the
                // system console code page and mangles Unicode paths without this.
                Console.OutputEncoding = new UTF8Encoding(false);
                try {
                    string request = Environment.GetEnvironmentVariable("MESSBOARD_FILE_DIALOG_REQUEST");
                    string reply;
                    if (Array.IndexOf(args, "-SelfTest") >= 0) reply = Engine.SelfTest(request);
                    else reply = Engine.Run(request, Array.IndexOf(args, "-ProbeCancel") >= 0);
                    Console.WriteLine(reply);
                    return 0;
                } catch (Exception) {
                    Console.WriteLine("{\"version\":1,\"status\":\"failed\",\"paths\":[],\"code\":\"native\"}");
                    return 1;
                }
            }
        }
    }

}
