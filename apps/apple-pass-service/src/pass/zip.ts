import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";

export async function zipPkpass(passSourceDir: string, outPkpassPath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPkpassPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    // Add all files from the pass source dir.
    // The top-level should include pass.json, manifest.json, signature, images, and any lproj folders.
    archive.directory(passSourceDir, false);

    archive.finalize();
  });
}
