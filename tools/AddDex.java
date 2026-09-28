import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Enumeration;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/** Copies base.apk (keeping each entry stored/deflated as aapt2 wrote it) and appends classes.dex. */
public class AddDex {
    public static void main(String[] a) throws Exception {
        try (ZipFile in = new ZipFile(a[0]); ZipOutputStream out = new ZipOutputStream(new FileOutputStream(a[1]))) {
            for (Enumeration<? extends ZipEntry> en = in.entries(); en.hasMoreElements(); ) {
                ZipEntry e = en.nextElement();
                byte[] data = in.getInputStream(e).readAllBytes();
                ZipEntry n = new ZipEntry(e.getName());
                if (e.getMethod() == ZipEntry.STORED) {
                    CRC32 crc = new CRC32();
                    crc.update(data);
                    n.setMethod(ZipEntry.STORED);
                    n.setSize(data.length);
                    n.setCompressedSize(data.length);
                    n.setCrc(crc.getValue());
                }
                out.putNextEntry(n);
                out.write(data);
                out.closeEntry();
            }
            for (int i = 2; i < a.length; i++) {
                Path p = Paths.get(a[i]);
                out.putNextEntry(new ZipEntry(p.getFileName().toString()));
                out.write(Files.readAllBytes(p));
                out.closeEntry();
            }
        }
    }
}
