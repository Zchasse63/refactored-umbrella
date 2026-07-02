"use client";

import { useEffect } from "react";

/** Top-level global error boundary. Replaces the root layout when an error is thrown
 *  in the root layout or template itself, so it must render its own <html>/<body>.
 *  Uses inline styles only — it must render even if the app stylesheet failed to load. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            textAlign: "center",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            backgroundColor: "#ffffff",
            padding: "40px 24px",
          }}
        >
          <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Something went wrong</p>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: "13px",
              lineHeight: 1.5,
              color: "#64748b",
            }}
          >
            An unexpected error occurred. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "20px",
              height: "32px",
              padding: "0 14px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: "#1e293b",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
