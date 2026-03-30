import Image from "next/image";
import { redirect } from "next/navigation";

import mooringsLogo from "@/assets/moorings-logo.png";
import { loginAction } from "@/app/auth/actions";
import { getQueryValue, getSession, normalizeNextPath } from "@/lib/auth";

import styles from "./login.module.css";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage(props: LoginPageProps) {
  const params = await props.searchParams;
  const nextPath = normalizeNextPath(getQueryValue(params.next), "/");
  const error = getQueryValue(params.error) === "invalid";
  const signedOut = getQueryValue(params.signed_out) === "1";

  const existingSession = await getSession();
  if (existingSession) {
    redirect(nextPath);
  }

  return (
    <main className={styles.loginPage}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <section className={styles.loginCard}>
        <header className={styles.brandHeader}>
          <Image src={mooringsLogo} alt="Moorings" width={110} height={62} className={styles.brandLogo} priority />
          <div>
            <p className={styles.brandName}>moorings.ms</p>
            <p className={styles.brandMeta}>Admin Portal</p>
          </div>
        </header>

        <div className={styles.copyBlock}>
          <h1 className={styles.title}>Fleet Planning Sign In</h1>
          <p className={styles.subtitle}>Use your Admin or Super Admin credentials to open the operations workspace.</p>
        </div>

        {error ? <p className={`${styles.notice} ${styles.noticeError}`}>Invalid credentials. Please try again.</p> : null}
        {signedOut ? <p className={`${styles.notice} ${styles.noticeInfo}`}>You have been signed out successfully.</p> : null}

        <form action={loginAction} className={styles.loginForm}>
          <input type="hidden" name="next" value={nextPath} />

          <label className={styles.field}>
            <span>Username</span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              placeholder="admin"
              required
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className={styles.input}
            />
          </label>

          <button type="submit" className={styles.submitButton}>
            Sign In
          </button>
        </form>
      </section>
    </main>
  );
}
