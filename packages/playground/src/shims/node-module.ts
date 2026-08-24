export function createRequire(_url: string | URL): (id: string) => never {
  return (id: string) => {
    throw new Error(`Native module ${JSON.stringify(id)} is not available in the browser.`);
  };
}
