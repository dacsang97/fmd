const fs = require("fs");
const axios = require("axios");
const chalk = require("chalk");
const https = require("https");
const log = console.log;
const nodeReq = require("request");
const progress = require("request-progress");
const readline = require("readline");
const _ = require("lodash");
const queue = require("queue")({
  concurrency: 1
});
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const PATTERN = /^(https:\/\/frontendmasters.com\/courses\/).+/g;
const courseURL = `https://api.frontendmasters.com/v1/kabuki/courses/`;

const isValidLink = link => {
  return PATTERN.test(link);
};

const cookiesFile = fs.readFileSync("./cookie.txt");
const request = axios.create({
  headers: {
    cookie: cookiesFile,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36",
    origin: "https://frontendmasters.com",
    referer:
      "https://frontendmasters.com/courses/content-strategy/introduction/"
  }
});

const startCmd = async () => {
  const argv = require("yargs")
    .command("dl [link]", "Download course")
    .option("link", {
      alias: "l",
      describe: "enter a link course"
    }).argv;

  const { link } = argv;
  if (!link || !isValidLink(link)) {
    log(chalk.bgRed("Link invalid"));
    return;
  }
  const slug = link.split("/")[4];
  fs.mkdirSync(`${__dirname}/${slug}`);
  try {
    await downloadCourse(slug, cookiesFile);
  } catch (e) {
    log(chalk.bgRed(e));
  }
};

const downloadSourceBase = async (sourceBaseUrl, slug, folder, line, cb) => {
  try {
    const response = await request.get(sourceBaseUrl);
    const { url } = response.data;
    const filename = `${slug}.webm`;
    progress(nodeReq(url), {})
      .on("progress", function(state) {
        readline.clearLine(rl, 0);
        readline.cursorTo(rl, 0);
        rl.write(statusBar(filename, state));
      })
      .on("error", function(err) {
        // Do something with err
      })
      .on("end", function() {
        readline.clearLine(rl, 0);
        readline.cursorTo(rl, 0);
        rl.write(chalk.bgGreen("DOWNLOADED") + " " + slug + "\n");
        cb();
      })
      .pipe(fs.createWriteStream(`${__dirname}/${folder}/${slug}.webm`));

    function statusBar(filename, progress) {
      let str = `${filename}    `;
      str += progressBar(progress.percent);
      str += stats(progress);
      return str;
    }

    function progressBar(percent) {
      percent = Math.floor(percent * 100);
      let str = `%${percent}[`;
      str += "=".repeat(percent);
      str += ">";
      str += " ".repeat(99 - percent);
      str += "] ";
      return str;
    }

    function stats({ speed, size, time }) {
      const sizeM = Math.round(size.transferred / 1024);
      const speedMb = Math.round(speed * 0.000008);
      const eta = new Date(time.remaining * 1000).toISOString().substr(11, 8);
      return `${sizeM}M ${speedMb}MB/s eta ${eta}`;
    }
  } catch (e) {
    log(e);
  }
};

const downloadCourse = async slugCourse => {
  const result = await request.get(`${courseURL}${slugCourse}`);
  const courseData = result.data;

  _.each(courseData.lessonHashes, (hash, id) => {
    const { sourceBase, slug } = courseData.lessonData[hash];
    queue.push(cb => {
      downloadSourceBase(
        sourceBase + "/source?r=720&f=webm",
        `${id + 1}-${slug}`,
        slugCourse,
        id + 1,
        cb
      );
    });
  });

  // begin processing, get notified on end / failure
  queue.start(function(err) {
    if (err) throw err;
    console.log("all done");
  });
};

startCmd();
