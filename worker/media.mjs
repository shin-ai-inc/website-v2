/*
  映像の範囲指定(Range)に応える。
  Workers の静的配信は Range を扱わず全体を 200 で返すため、Safari が映像を再生せず、
  Chrome は途中へ飛べない。wrangler.jsonc の run_worker_first で映像の置き場所だけここを通し、
  ほかは静的配信に任せる。複数の範囲には応えず全体を返す(仕様上それでよい)。
*/

/** "bytes=a-b" を読む。読めない・複数なら null、満たせなければ "unsatisfiable" */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start;
  let end;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

const MEDIA = /\.(mp4|m4v|webm|mov)$/i;

export async function serveMedia(request, assets) {
  const url = new URL(request.url);
  if (!MEDIA.test(url.pathname)) return assets.fetch(request);

  const whole = await assets.fetch(new Request(url, { method: "GET" }));
  if (whole.status !== 200) return whole;

  const headers = new Headers(whole.headers);
  headers.set("Accept-Ranges", "bytes");
  const body = new Uint8Array(await whole.arrayBuffer());
  const size = body.byteLength;
  const range = parseRange(request.headers.get("Range"), size);

  if (range === "unsatisfiable") {
    headers.delete("Content-Length");
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range === null) {
    headers.set("Content-Length", String(size));
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  }
  const part = body.subarray(range.start, range.end + 1);
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(part.byteLength));
  return new Response(request.method === "HEAD" ? null : part, { status: 206, headers });
}

export default {
  fetch(request, env) {
    return serveMedia(request, env.ASSETS);
  }
};
