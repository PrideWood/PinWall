type AppEnvironment = {
  matchMedia: (query: string) => { matches: boolean };
  navigator: object;
};

export function isStandalone(environment: AppEnvironment = window): boolean {
  return (
    environment.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in environment.navigator &&
      environment.navigator.standalone === true)
  );
}

export function pairingTokenFromLink(value: string, origin: string): string {
  const invalid = () =>
    new Error("请粘贴本站的有效首次绑定链接，不能使用编辑授权二维码链接。");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalid();
  }
  const hash = new URLSearchParams(url.hash.slice(1));
  const token = hash.get("pair");
  if (
    url.origin !== origin ||
    url.pathname !== "/phone" ||
    url.search ||
    url.username ||
    url.password ||
    hash.size !== 1 ||
    !token ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    throw invalid();
  }
  return token;
}
