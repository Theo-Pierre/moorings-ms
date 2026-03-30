import Image from "next/image";
import { redirect } from "next/navigation";

import mooringsLogo from "@/assets/moorings-logo.png";
import { getQueryValue, getSession, normalizeNextPath } from "@/lib/auth";

import { LoginPortal } from "./LoginPortal";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage(props: LoginPageProps) {
  const params = await props.searchParams;
  const nextPath = normalizeNextPath(getQueryValue(params.next), "/");
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
          <h1 className={styles.title}>Fleet Planning Access Portal</h1>
          <p className={styles.subtitle}>
            Firebase authentication with role-based access. New users default to Viewer until promoted.
          </p>
        </div>

        <LoginPortal nextPath={nextPath} signedOut={signedOut} />
      </section>
    </main>
  );
}
