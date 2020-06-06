const { spawn } = require("child_process");
const fs = require("fs-extra");
const argv = require("yargs").argv;

const path = argv.path;

function getFiles(path) {
  return fs.readdirSync(`${path}`);
}

function getTranscodeFiles(files) {
  const transCodeFiles = [];

  for (const file of files) {
    const splits = file.split(".");
    const fileExt = splits[splits.length - 1];
    if (fileExt === "mkv") {
      transCodeFiles.push({
        filepath: file,
        path: `${path}/${file}`,
        ext: fileExt,
        filename: splits.splice(0, splits.length -1).join(".")
      });
    }
  }

  return transCodeFiles;
}

async function getAudioCodecs(transCodeFile) {
  return new Promise(function (resolve, reject) {
    let json = "";
    const ffprobe = spawn("ffprobe", [
      "-hide_banner",
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      `${transCodeFile}`,
    ]);

    ffprobe.stdout.on("data", (data) => {
      json += data.toString("utf8");
    });

    ffprobe.stderr.on("data", (data) => {
      reject(`Program exited with error ${data}`);
    });

    ffprobe.on("close", (code) => {
      const parsedJson = JSON.parse(json);
      const codecs = [];
      for (const entry of parsedJson.streams) {
        if (entry.codec_type === "audio") {
          codecs.push(entry.codec_name);
        }
      }
      resolve(codecs);
    });
  });
}

async function convertDTS(transCodeFile) {
  return new Promise(function (resolve, reject) {
    const outputPath = `${path}/${transCodeFile.filename}_ac3.${transCodeFile.ext}`;
    const dtsConvert = spawn("ffmpeg", [
      "-i",
      `${transCodeFile.path}`,
      "-c:v",
      "copy",
      "-c:a",
      "ac3",
      "-b:a",
      "640k",
      "-c:s",
      "copy",
      "-hide_banner",
      "-stats",
      "-progress",
      "pipe:1",
      `${outputPath}`,
    ]);

    dtsConvert.stdout.on("data", (data) => {
        const linesSplit = data.toString("utf8").split("\n");
        for (const line of linesSplit) {
            const lineSplit = line.split("=")
            if (lineSplit[0] === 'total_size') console.log(`Size: ${parseInt(lineSplit[1], 10) / 1024 / 1024} MB`)
        }
    });

    // dtsConvert.stderr.on("data", (data) => {
    //   reject(`Program exited with error ${data}`);
    // });

    dtsConvert.on("close", (code) => {
      resolve(`Transcoded successfully`);
    });
  });
}

(async function main() {
  const files = getFiles(path);

  const transCodeFiles = getTranscodeFiles(files);

  for (const transCodeFile of transCodeFiles) {
    console.log(`Checking ${transCodeFile.filepath}`);

    const audioCodec = await getAudioCodecs(transCodeFile.path);
    console.log(`Found codecs: ${audioCodec}`);

    // Convert
    if (audioCodec.includes("dts") && !audioCodec.includes("ac3")) {
      console.log(await convertDTS(transCodeFile));
    }
  }
})();
