const response = await fetch("http://127.0.0.1:3300/api/health").catch(() => null);

if (!response?.ok) {
  process.exit(1);
}
