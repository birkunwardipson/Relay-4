import { useState, type FormEvent } from "react";
import { loginOperator } from "../api";

export function LoginScreen({ onLogin }: { onLogin: (operator: string) => void }) {
  const [username, setUsername] = useState("Pete");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await loginOperator(username, password);
      sessionStorage.setItem("relay4.operator", result.operator);
      onLogin(result.operator);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operator login failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="card login-card" aria-labelledby="login-title">
        <div className="login-logo">RELAY<span>4</span></div>
        <p className="eyebrow">Operations console</p>
        <h1 id="login-title">Operator login</h1>
        <p className="muted">Sign in to review incidents and coordinate the response workspace.</p>
        <form onSubmit={submit}>
          <label>
            <span>Operator</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required autoFocus />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="btn primary block" type="submit" disabled={pending || !username.trim() || !password}>
            {pending ? "Signing in…" : "Sign in as operator"}
          </button>
        </form>
      </section>
    </main>
  );
}
