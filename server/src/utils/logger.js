const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

const serialize = (level, message, meta = {}) =>
  JSON.stringify({
    level,
    message,
    meta,
    timestamp: new Date().toISOString()
  });

const writeStdout = (line) => {
  process.stdout.write(`${line}\n`);
};

const writeStderr = (line) => {
  process.stderr.write(`${line}\n`);
};

const info = (message, meta = {}) => {
  const line = serialize("info", message, meta);
  if (isProduction) {
    writeStdout(line);
    return;
  }

  writeStdout(line);
};

const warn = (message, meta = {}) => {
  const line = serialize("warn", message, meta);
  if (isProduction) {
    writeStdout(line);
    return;
  }

  writeStdout(line);
};

const error = (message, meta = {}) => {
  writeStderr(serialize("error", message, meta));
};

module.exports = {
  info,
  warn,
  error
};

