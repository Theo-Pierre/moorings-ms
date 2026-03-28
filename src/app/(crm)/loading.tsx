export default function CrmLoading() {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.7rem",
        padding: "1rem",
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        style={{
          height: "96px",
          borderRadius: "16px",
          border: "1px solid rgba(16, 48, 76, 0.14)",
          background:
            "linear-gradient(90deg, rgba(226, 239, 250, 0.8) 25%, rgba(243, 251, 255, 0.95) 50%, rgba(226, 239, 250, 0.8) 75%)",
          backgroundSize: "220% 100%",
          animation: "loadingShimmer 1.4s ease infinite",
        }}
      />
      <div
        style={{
          height: "420px",
          borderRadius: "16px",
          border: "1px solid rgba(16, 48, 76, 0.14)",
          background:
            "linear-gradient(90deg, rgba(226, 239, 250, 0.8) 25%, rgba(243, 251, 255, 0.95) 50%, rgba(226, 239, 250, 0.8) 75%)",
          backgroundSize: "220% 100%",
          animation: "loadingShimmer 1.4s ease infinite",
        }}
      />
      <style>{`
        @keyframes loadingShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
