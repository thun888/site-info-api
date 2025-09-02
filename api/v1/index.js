import https from "node:https";
import { JSDOM } from "jsdom";

const HOSTS = process.env.HOSTS || ['localhost'];
const cache = {};
export default async function handler(req, res) {
  const referer = req.headers.referer || "";
  if (referer.length > 0) {
    const refererHost = new URL(referer).hostname || "";
    if (!HOSTS.includes(refererHost)) {
      console.error("referer invalid:", referer);
      res.json({
        title: "请自部署该服务",
        desc: "https://github.com/xaoxuu/site-info-api/",
      });
      return;
    }
  } else {
    if (!HOSTS.includes("")) {
      console.error("referer can not be empty!");
      res.json({
        title: "请自部署该服务",
        desc: "https://github.com/xaoxuu/site-info-api/",
      });
      return;
    }
  }
  console.log("referer ok:", referer);
    // 参数 type url
    // type 不存在默认是 site
    // type: site | voice | file
    // url: 网址
  const validTypes = ["site", "voice", "file"];
  const type = req.query?.type || "site";
  if (!validTypes.includes(type)) {
    console.log("type invalid:", type);
    res.json({});
    return;
  }
  console.log("type:", type);

  const url = req.query?.url || "";
  if (!url.startsWith("http")) {
    console.error("url invalid:", url);
    res.json({});
    return;
  }
  console.log("url:", url);

  res.setHeader("Vercel-CDN-Cache-Control", "max-age=604800");

  const cacheKey = `${type} ${url}`;
  if (cache[cacheKey]) {
    console.log("use cache");
    res.json(cache[cacheKey]);
    return;
  }

  switch (type) {
    case "site":
      main(url, (data) => {
        if (Object.keys(data).length > 0) {
          data.url = url;
          cache[cacheKey] = data;
        }
        res.json(data);
      });
      break;
    case "voice":
      res.json({});
      break;
    case "file":
      getFile(url, (data) => {
        if (Object.keys(data).length > 0) {
          data.url = url;
          cache[cacheKey] = data;
        }
        res.json(data);
      });
      break;
    default:
      console.error("can not exist!");
      res.json({});
  }
}

function main(url, callback) {
  const request = https.get(url, (response) => {
    let html = "";
    response.on("data", (chunk) => {
      html += chunk.toString();
    });
    response.on("end", () => {
      console.log("end:", response.statusCode);
      if (response.statusCode !== 200) {
        let location = response.headers["location"];
        let isRedirect = [301, 302, 303, 307, 308].includes(response.statusCode);
        if (isRedirect && location && location !== url) {
          main(location, callback);
          return;
        } else {
          callback({});
          return;
        }
      }
      getInfo(url, html, (data) => {
        callback(data);
      });
    });
  });
  request.on("error", (error) => {
    console.error("error:", error);
    callback({});
  });
  request.end();
}
/**
 * Determine if it is a ['https://', 'http://', '//'] protocol
 * @param {String} url Website url
 * @returns {Boolean}
 */
function isHttp(url) {
  return /^(https?:)?\/\//g.test(url);
}

function getInfo(link, html, callback) {
  try {
    let data = {};
    let title, icon, desc;
    const { document } = new JSDOM(html).window;

    // title
    let elTitle = document.querySelector("title") ||
                  document.querySelector("head meta[property='og:title']");
    if (elTitle) title = elTitle.text || elTitle.content;
    if (title) data.title = title;

    // desc
    let elDesc = document.querySelector("head meta[property='og:description']") ||
                 document.querySelector("head meta[name='description']");
    if (elDesc) desc = elDesc.content;
    if (desc) data.desc = desc;

    // icon
    let elIcon =
      document.querySelector("head link[rel='apple-touch-icon']") ||
      document.querySelector("head link[rel='icon']");
    if (elIcon) {
      icon = elIcon.getAttribute("href");
    } else {
      elIcon =
        document.querySelector("head meta[property='og:image']") ||
        document.querySelector("head meta[property='twitter:image']");
      if (elIcon) icon = elIcon.content;
    }

    if (/^data:image/.test(icon)) icon = "";

    if (!icon) {
      const links = [...document.querySelectorAll("link[rel][href]")];
      elIcon = links.find((_el) => _el.rel.includes("icon"));
      icon = elIcon && elIcon.getAttribute("href");
    }

    if (icon && !isHttp(icon)) {
      icon = new URL(link).origin + icon;
    }
    if (icon) data.icon = icon;

    callback(data);
  } catch (error) {
    console.log("error >>", error);
    callback({});
  }
}

function getFile(url, callback) {
  const request = https.get(url, (response) => {
    response.setEncoding("binary"); // 二进制
    let file = "";
    response.on("data", (chunk) => {
      file += chunk;
    });
    response.on("end", () => {
      console.log("end:", response.statusCode);
      if (response.statusCode !== 200) {
        let location = response.headers["location"];
        let isRedirect = [301, 302, 303, 307, 308].includes(response.statusCode);
        if (isRedirect && location && location !== url) {
          getFile(location, callback);
          return;
        } else {
          callback({});
          return;
        }
      }
      let data = {};
      data.file = Buffer.from(file, "binary");
      callback(data);
    });
  });
  request.on("error", (error) => {
    console.error("error:", error);
    callback({});
  });
  request.end();
}
