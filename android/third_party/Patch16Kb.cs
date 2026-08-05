// Patch prebuilt libnode.so for Android 16 16KB page support.
//
// Keeps ALL virtual addresses unchanged; only re-places file content so every
// LOAD segment satisfies (p_offset % 0x4000) == (p_vaddr % 0x4000) and p_align = 0x4000.
using System;
using System.IO;
using System.Collections.Generic;

class Patch16Kb
{
    const ulong PAGE = 0x4000UL;

    static ulong RU16(byte[] b, long o) { return BitConverter.ToUInt16(b, (int)o); }
    static ulong RU32(byte[] b, long o) { return BitConverter.ToUInt32(b, (int)o); }
    static ulong RU64(byte[] b, long o) { return BitConverter.ToUInt64(b, (int)o); }
    static void WU32(byte[] b, long o, ulong v) { var x = BitConverter.GetBytes((uint)v); Array.Copy(x, 0, b, o, 4); }
    static void WU64(byte[] b, long o, ulong v) { var x = BitConverter.GetBytes(v); Array.Copy(x, 0, b, o, 8); }

    static void Patch(string file, bool checkOnly)
    {
        Console.WriteLine("==== " + file + " ====");
        byte[] orig = File.ReadAllBytes(file);
        ulong size = (ulong)orig.Length;
        if (size < 64 || orig[0] != 0x7F || orig[1] != (byte)'E' || orig[2] != (byte)'L' || orig[3] != (byte)'F')
        { Console.WriteLine("  Not an ELF, skipped."); return; }
        bool is64 = orig[4] == 2;

        long phoffO, shoffO, pheszO, phnumO, sheszO, shnumO;
        int F_off, F_va, F_pa, F_fsz, F_msz, F_align, shOffF, shAddrF, shTypeF;
        if (is64)
        {
            phoffO = 0x20; shoffO = 0x28; pheszO = 0x36; phnumO = 0x38; sheszO = 0x3A; shnumO = 0x3C;
            F_off = 8; F_va = 16; F_pa = 24; F_fsz = 32; F_msz = 40; F_align = 48;
            shOffF = 24; shAddrF = 16; shTypeF = 4;
        }
        else
        {
            phoffO = 0x1C; shoffO = 0x20; pheszO = 0x2A; phnumO = 0x2C; sheszO = 0x2E; shnumO = 0x30;
            F_off = 4; F_va = 8; F_pa = 12; F_fsz = 16; F_msz = 20; F_align = 28;
            shOffF = 16; shAddrF = 12; shTypeF = 4;
        }
        Func<byte[], long, ulong> GetF = (b, o) => is64 ? RU64(b, o) : RU32(b, o);
        Action<byte[], long, ulong> SetF = (b, o, v) => { if (is64) WU64(b, o, v); else WU32(b, o, v); };

        ulong phoff = GetF(orig, phoffO), shoff = GetF(orig, shoffO);
        ulong phesz = RU16(orig, pheszO), phnum = RU16(orig, phnumO);
        ulong shesz = RU16(orig, sheszO), shnum = RU16(orig, shnumO);
        Console.WriteLine(string.Format("  ELF{0} phnum={1} shnum={2} size=0x{3:X}", is64 ? 64 : 32, phnum, shnum, size));

        var phType = new uint[(int)phnum]; var phOff = new ulong[(int)phnum]; var phVa = new ulong[(int)phnum];
        var phFsz = new ulong[(int)phnum]; var phMsz = new ulong[(int)phnum];
        for (int i = 0; i < (int)phnum; i++)
        {
            long ph = (long)(phoff + (ulong)i * phesz);
            phType[i] = (uint)RU32(orig, ph);
            phOff[i] = GetF(orig, ph + F_off);
            phVa[i] = GetF(orig, ph + F_va);
            phFsz[i] = GetF(orig, ph + F_fsz);
            phMsz[i] = GetF(orig, ph + F_msz);
        }

        // per-LOAD delta so that (off + d) % PAGE == va % PAGE; vaddr stays untouched
        var newOff = new ulong[(int)phnum]; var delta = new ulong[(int)phnum];
        int loads = 0; bool already = true; ulong prevEnd = 0;
        for (int i = 0; i < (int)phnum; i++)
        {
            if (phType[i] != 1) continue;
            loads++;
            delta[i] = ((phVa[i] % PAGE) + PAGE - (phOff[i] % PAGE)) % PAGE;
            newOff[i] = phOff[i] + delta[i];
            if (delta[i] != 0) already = false;
            if (newOff[i] < prevEnd)
            { Console.WriteLine(string.Format("  ERROR: shifted LOAD[{0}] overlaps previous segment!", i)); return; }
            prevEnd = newOff[i] + phFsz[i];
            Console.WriteLine(string.Format("  LOAD[{0}] off 0x{1:X} -> 0x{2:X} (d=+0x{3:X}) va 0x{4:X}", i, phOff[i], newOff[i], delta[i], phVa[i]));
        }
        if (loads == 0) { Console.WriteLine("  No LOAD segments?!"); return; }
        if (already) { Console.WriteLine("  Already 16KB congruent."); return; }

        Func<ulong, ulong> deltaByOff = delegate(ulong off)
        {
            for (int k = 0; k < (int)phnum; k++)
                if (phType[k] == 1 && phFsz[k] > 0 && off >= phOff[k] && off < phOff[k] + phFsz[k]) return delta[k];
            return 0UL;
        };
        Func<ulong, bool> inLoad = delegate(ulong off)
        {
            for (int k = 0; k < (int)phnum; k++)
                if (phType[k] == 1 && phFsz[k] > 0 && off >= phOff[k] && off < phOff[k] + phFsz[k]) return true;
            return false;
        };
        Func<ulong, ulong> deltaByVa = delegate(ulong va)
        {
            for (int k = 0; k < (int)phnum; k++)
                if (phType[k] == 1 && va >= phVa[k] && va < phVa[k] + phMsz[k]) return delta[k];
            return 0UL;
        };

        if (checkOnly) { Console.WriteLine("  [CheckOnly] no file written."); return; }

        // tail position after all shifted content (never shrink: trailing bytes beyond
        // segments, e.g. the section header table, must keep their place)
        ulong tail = size;
        for (int i = 0; i < (int)phnum; i++)
        {
            if (phType[i] == 1) { ulong e = newOff[i] + phFsz[i]; if (e > tail) tail = e; }
            else if (phFsz[i] > 0) { ulong e = phOff[i] + deltaByOff(phOff[i]) + phFsz[i]; if (e > tail) tail = e; }
        }
        ulong shNewOff = tail;
        int newSize = checked((int)(shNewOff + shnum * shesz));
        byte[] nb = new byte[newSize];

        // orphan sections: file content NOT covered by any LOAD segment (debug/.symtab etc.).
        // Shifted LOAD segments may overwrite their original place, so move them to the tail.
        var orphanOff = new ulong[(int)shnum];
        ulong cur = tail;
        for (int s = 0; s < (int)shnum; s++)
        {
            long src = (long)(shoff + (ulong)s * shesz);
            uint stype = (uint)RU32(orig, src + shTypeF);
            if (stype == 8 || stype == 0) continue;
            ulong soff = GetF(orig, src + shOffF);
            ulong ssz = GetF(orig, src + (shOffF + (is64 ? 8 : 4)));
            if (soff == 0 || ssz == 0) continue;
            if (inLoad(soff)) continue;
            cur = (cur + 15UL) & ~15UL;
            orphanOff[s] = cur;
            cur += ssz;
        }
        shNewOff = (cur + 15UL) & ~15UL;
        newSize = checked((int)(shNewOff + shnum * shesz));
        nb = new byte[newSize];

        // copy orphan section content to the tail
        for (int s = 0; s < (int)shnum; s++)
        {
            if (orphanOff[s] == 0) continue;
            long src = (long)(shoff + (ulong)s * shesz);
            ulong soff = GetF(orig, src + shOffF);
            ulong ssz = GetF(orig, src + (shOffF + (is64 ? 8 : 4)));
            Array.Copy(orig, (long)soff, nb, (long)orphanOff[s], (long)ssz);
        }

        // header + phdr table live inside first LOAD segment -> shift with it
        ulong d0 = 0;
        for (int i = 0; i < (int)phnum; i++)
            if (phType[i] == 1 && phOff[i] == 0) { d0 = delta[i]; break; }
        Array.Copy(orig, 0, nb, (int)d0, (int)(phoff + phnum * phesz));
        SetF(nb, phoffO, phoff + d0);

        // LOAD content
        for (int i = 0; i < (int)phnum; i++)
            if (phType[i] == 1 && phFsz[i] > 0)
                Array.Copy(orig, (long)phOff[i], nb, (long)newOff[i], (long)phFsz[i]);
        // non-LOAD content
        var newSegOff = new ulong[(int)phnum];
        for (int i = 0; i < (int)phnum; i++)
        {
            if (phType[i] == 1 || phFsz[i] == 0) { newSegOff[i] = phOff[i]; continue; }
            ulong d = deltaByOff(phOff[i]);
            Array.Copy(orig, (long)phOff[i], nb, (long)(phOff[i] + d), (long)phFsz[i]);
            newSegOff[i] = phOff[i] + d;
        }

        // update program headers
        long phBase = (long)(phoff + d0);
        for (int i = 0; i < (int)phnum; i++)
        {
            long ph = phBase + (long)((ulong)i * phesz);
            if (phType[i] == 1)
            {
                SetF(nb, ph + F_off, newOff[i]);
                SetF(nb, ph + F_pa, newOff[i]);
                SetF(nb, ph + F_align, PAGE);
            }
            else
            {
                SetF(nb, ph + F_off, newSegOff[i]);
                // vaddr unchanged
            }
        }

        // section header table moved to EOF; sh_offset updated
        for (int s = 0; s < (int)shnum; s++)
        {
            long src = (long)(shoff + (ulong)s * shesz);
            long dst = (long)(shNewOff + (ulong)s * shesz);
            Array.Copy(orig, src, nb, dst, (int)shesz);
            if (orphanOff[s] != 0) { SetF(nb, dst + shOffF, orphanOff[s]); continue; }
            uint stype = (uint)RU32(nb, dst + shTypeF);
            if (stype == 8) continue; // SHT_NOBITS
            ulong soff = GetF(nb, dst + shOffF);
            if (soff == 0) continue;
            ulong d = deltaByOff(soff);
            if (d == 0 && !inLoad(soff))
            {
                ulong saddr = GetF(nb, dst + shAddrF);
                if (saddr != 0) d = deltaByVa(saddr);
            }
            if (d != 0) SetF(nb, dst + shOffF, soff + d);
        }
        SetF(nb, shoffO, shNewOff);

        File.WriteAllBytes(file, nb);
        Console.WriteLine(string.Format("  Written: 0x{0:X} -> 0x{1:X} bytes (+0x{2:X})", size, (ulong)newSize, (ulong)newSize - size));
    }

    static int Main(string[] args)
    {
        bool checkOnly = Array.IndexOf(args, "--check") >= 0;
        foreach (var f in args)
            if (f != "--check") Patch(f, checkOnly);
        return 0;
    }
}
