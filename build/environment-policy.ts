export function assertPrivateEnvironment(environment: Record<string, string | undefined>) {
  const publicNames = Object.keys(environment).filter(name => /^(?:VITE_|NEXT_PUBLIC_)/.test(name));
  if (publicNames.length) {
    throw new Error(`Variáveis públicas não são permitidas neste projeto: ${publicNames.join(", ")}. Configure os valores privados como secrets do Worker em runtime.`);
  }
}
