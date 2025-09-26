"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import {
  signInWithEmail,
  signInWithPassword,
  signUpWithPassword,
} from "@/../app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Layers,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

type StatusTone = "info" | "success" | "error";
type StatusMessage = { tone: StatusTone; message: string } | null;
type ActiveAction = "magic" | "signin" | "signup" | null;

const highlightItems = [
  {
    icon: Sparkles,
    title: "AI-generated backlog",
    description:
      "Spin up Epics, Stories, and Tasks with context-aware prompts and guardrails.",
  },
  {
    icon: Layers,
    title: "Context that travels",
    description:
      "Upload briefs and specs once—ThriveIQ threads them through every generation.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise ready",
    description:
      "Role-based access, audit trails, and encryption baked in from day zero.",
  },
] as const;

export default function LoginPage() {
  const [magicEmail, setMagicEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicStatus, setMagicStatus] = useState<StatusMessage>(null);
  const [passwordStatus, setPasswordStatus] = useState<StatusMessage>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [isPending, startTransition] = useTransition();

  const setStatusMessage = (
    setter: React.Dispatch<React.SetStateAction<StatusMessage>>,
    message: string,
    tone: StatusTone,
  ) => {
    setter({ message, tone });
  };

  const renderStatus = (status: StatusMessage) => {
    if (!status) return null;
    const variant = status.tone === "error" ? "destructive" : "default";
    const style =
      status.tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-900/20 dark:text-emerald-200"
        : status.tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border/60 bg-muted/60 text-muted-foreground";

    return (
      <Alert variant={variant} className={`${style} border text-sm`}>
        <AlertDescription>{status.message}</AlertDescription>
      </Alert>
    );
  };

  const handleMagicLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!magicEmail) {
      setStatusMessage(setMagicStatus, "Please add the email address you use with ThriveIQ.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("email", magicEmail);

    setActiveAction("magic");
    startTransition(async () => {
      setStatusMessage(setMagicStatus, "Sending your secure magic link...", "info");
      setPasswordStatus(null);
      const res = await signInWithEmail(formData);
      if (res.ok) {
        setStatusMessage(setMagicStatus, "Check your inbox for a one-time link to sign in.", "success");
      } else {
        setStatusMessage(setMagicStatus, res.error || "We couldn't send that magic link.", "error");
      }
    });
  };

  const handleSignIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginEmail || !password) {
      setStatusMessage(setPasswordStatus, "Email and password are both required to sign in.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("email", loginEmail);
    formData.append("password", password);

    setActiveAction("signin");
    startTransition(async () => {
      setStatusMessage(setPasswordStatus, "Signing you in...", "info");
      setMagicStatus(null);
      const res = await signInWithPassword(formData);
      if (res.ok) {
        setStatusMessage(setPasswordStatus, "Welcome back! Redirecting you to ThriveIQ...", "success");
        window.location.assign(res.redirectTo || "/");
      } else {
        setStatusMessage(
          setPasswordStatus,
          res.error || "Unable to sign in with those credentials.",
          "error",
        );
      }
    });
  };

  const handleSignUp = () => {
    if (!loginEmail || !password) {
      setStatusMessage(
        setPasswordStatus,
        "Use the email and password fields above before creating an account.",
        "error",
      );
      return;
    }

    const formData = new FormData();
    formData.append("email", loginEmail);
    formData.append("password", password);

    setActiveAction("signup");
    startTransition(async () => {
      setStatusMessage(setPasswordStatus, "Creating your ThriveIQ account...", "info");
      setMagicStatus(null);
      const res = await signUpWithPassword(formData);
      if (res.ok) {
        setStatusMessage(
          setPasswordStatus,
          "Account created! Check your inbox to confirm email, then sign in.",
          "success",
        );
      } else {
        setStatusMessage(
          setPasswordStatus,
          res.error || "Sign up didn't complete. Please try again.",
          "error",
        );
      }
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-primary/40 blur-3xl" />
        <div className="absolute top-20 right-[-10%] h-[420px] w-[420px] rounded-full bg-secondary/30 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/25 blur-2xl" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-12 sm:px-8">
        <Link
          href="/"
          className="absolute right-6 top-6 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Back to home
        </Link>

        <div className="grid w-full max-w-5xl gap-8 rounded-[32px] bg-background/80 p-6 shadow-2xl backdrop-blur-xl ring-1 ring-border/50 lg:grid-cols-[1.05fr,0.95fr] lg:p-12">
          <aside className="hidden h-full flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-secondary to-accent p-10 text-primary-foreground shadow-xl lg:flex">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold tracking-wide">
                <Zap className="h-5 w-5" />
                ThriveIQ Platform
              </div>
              <h1 className="text-3xl font-semibold leading-tight">
                Intelligent backlog operations for teams who move fast.
              </h1>
              <p className="text-base text-primary-foreground/80">
                Bring your strategy, context, and delivery workflows together with an AI copilot that understands your product.
              </p>
            </div>

            <div className="space-y-4">
              {highlightItems.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm"
                >
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-primary-foreground/80">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Zap className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-3xl">Sign in to ThriveIQ</CardTitle>
                  <CardDescription className="text-base">
                    Access your AI-powered workspace and keep your backlog evolving.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-8">
              <section className="rounded-2xl border border-border/60 bg-background/70 p-6 shadow-sm">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Magic link</h2>
                  <p className="text-sm text-muted-foreground">
                    Skip passwords—receive a secure, one-time sign-in link by email.
                  </p>
                </div>

                <form onSubmit={handleMagicLink} className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">Work email</Label>
                    <Input
                      id="magic-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={magicEmail}
                      onChange={(event) => {
                        setMagicEmail(event.target.value);
                      }}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isPending && activeAction === "magic"}
                  >
                    {isPending && activeAction === "magic"
                      ? "Sending magic link..."
                      : "Email me a magic link"}
                  </Button>
                </form>
                <div className="mt-4 space-y-3">
                  {renderStatus(magicStatus)}
                </div>
              </section>

              <div className="relative flex items-center justify-center text-sm text-muted-foreground">
                <span className="bg-card px-4">or use your password</span>
                
              </div>

              <section className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-6 shadow-sm">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Email &amp; password</h2>
                  <p className="text-sm text-muted-foreground">
                    Sign in instantly or create a new account using your team email.
                  </p>
                </div>

                <form onSubmit={handleSignIn} className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={loginEmail}
                      onChange={(event) => {
                        setLoginEmail(event.target.value);
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                      }}
                      required
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
                    <Button
                      type="submit"
                      disabled={isPending && activeAction === "signin"}
                    >
                      {isPending && activeAction === "signin"
                        ? "Signing in..."
                        : "Sign in"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSignUp}
                      disabled={isPending && activeAction === "signup"}
                    >
                      {isPending && activeAction === "signup"
                        ? "Creating..."
                        : "Create account"}
                    </Button>
                  </div>
                </form>
                <div className="mt-4 space-y-3">
                  {renderStatus(passwordStatus)}
                </div>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
