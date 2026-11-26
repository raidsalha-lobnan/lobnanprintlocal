using System;
using System.IO;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Threading;

// Standalone Windows update worker. Copied outside the app directory before
// launch, so an NSIS update can replace the app without locking its resources.
internal static class UpdateHelper {
 static string log, result;
 static void Note(string message) {
  try { File.AppendAllText(log, DateTime.UtcNow.ToString("o")+" "+message+Environment.NewLine); } catch {}
 }
 static void WriteResult(string message) { try { File.WriteAllText(result,message); } catch {} }
 static bool SameVersion(string actual, Version expected) {
  Version v;
  return Version.TryParse(actual,out v) && v.Major==expected.Major && v.Minor==expected.Minor && v.Build==expected.Build;
 }
 static int Main(string[] args) {
  if(args.Length!=7) return 2;
  string installer=args[1], app=args[2], handoff=args[5], digest=args[4];
  string dir=Path.GetDirectoryName(installer);
  log=Path.Combine(dir,"install-native.log"); result=Path.Combine(dir,"install-result.txt");
  bool reopen=false;
  string outcome="UNKNOWN";
  try {
   int pid=int.Parse(args[0]); Version expected=new Version(args[3]);
   bool interactive=args[6]=="interactive";
   if(!Path.IsPathRooted(installer)||!Path.IsPathRooted(app)||Path.GetDirectoryName(handoff)!=dir||
      !Path.GetFileName(handoff).StartsWith("helper-")||
      Path.GetFileName(installer)!="LobnanPrint-Setup-"+args[3]+".exe"||
      !System.Text.RegularExpressions.Regex.IsMatch(digest,"^[0-9a-fA-F]{64}$")||
      !File.Exists(app)||!File.Exists(installer)) throw new Exception("NATIVE_HELPER_INVALID_INPUT");
   Note("NATIVE_HELPER_STARTED "+expected);
   using(Process previous=Process.GetProcessById(pid)) {
    // Acquire the process handle while the parent is still alive.
    IntPtr handle=previous.Handle;
    File.WriteAllText(handoff+".ready","HELPER_READY");
    DateTime authorization=DateTime.UtcNow.AddSeconds(45);
    while(!File.Exists(handoff+".go")&&DateTime.UtcNow<authorization) Thread.Sleep(100);
    if(!File.Exists(handoff+".go")||File.ReadAllText(handoff+".go")!="AUTHORIZED") throw new Exception("HANDOFF_NOT_AUTHORIZED");
    if(!previous.WaitForExit(180000)) throw new Exception("OLD_PROCESS_STILL_RUNNING");
   }
   string processName=Path.GetFileNameWithoutExtension(app);
   DateTime deadline=DateTime.UtcNow.AddSeconds(30);
   while(true) {
    Process[] processes=Process.GetProcessesByName(processName);
    bool any=processes.Length>0;
    foreach(Process p in processes) p.Dispose();
    if(!any) break;
    if(DateTime.UtcNow>=deadline) throw new Exception("APP_PROCESS_STILL_RUNNING");
    Thread.Sleep(250);
   }
   reopen=true;
   using(FileStream input=File.OpenRead(installer))
   using(SHA256 sha=SHA256.Create()) {
    string actual=BitConverter.ToString(sha.ComputeHash(input)).Replace("-","");
    if(!String.Equals(actual,digest,StringComparison.OrdinalIgnoreCase)) throw new Exception("INSTALLER_CHECKSUM_CHANGED");
   }
   Note("INSTALL_START");
   using(Process setup=Process.Start(new ProcessStartInfo(installer,interactive?"":"/S") {
     WorkingDirectory=dir, UseShellExecute=false, CreateNoWindow=!interactive
   })) {
    if(setup==null) throw new Exception("INSTALLER_START_FAILED");
    setup.WaitForExit();
    if(setup.ExitCode!=0) throw new Exception("INSTALLER_EXIT_"+setup.ExitCode);
   }
   string installed=FileVersionInfo.GetVersionInfo(app).FileVersion;
   if(!SameVersion(installed,expected)) throw new Exception("INSTALLED_VERSION_MISMATCH_"+installed);
   outcome="VERIFIED_INSTALLED";
  } catch(Exception e) { outcome=e.Message; }
  Note(outcome); WriteResult(outcome);
  if(reopen && File.Exists(app)) {
   try {
    using(Process p=Process.Start(new ProcessStartInfo(app,"--lobnan-update-return"){WorkingDirectory=Path.GetDirectoryName(app),UseShellExecute=false})) {
     if(p==null) throw new Exception("REOPEN_START_FAILED");
    }
    Note("APP_REOPEN_REQUESTED");
   } catch(Exception e) { Note("REOPEN_FAILED "+e.Message);WriteResult(outcome+"; REOPEN_FAILED "+e.Message);return 7; }
  }
  return outcome=="VERIFIED_INSTALLED"?0:6;
 }
}
