export function OperationOverlay({
  message,
  title = "Working on it",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div
      aria-live="polite"
      aria-modal="true"
      className="fixed inset-0 z-[4000] grid place-items-center bg-[rgba(7,12,17,0.28)] px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
    >
      <div className="grid w-full max-w-[360px] justify-items-center gap-4 rounded-[8px] border border-[#d7dfeb] bg-white px-6 py-7 text-center shadow-[0_24px_64px_rgba(16,24,40,0.24)]">
        <span className="h-11 w-11 animate-spin rounded-full border-[4px] border-[#d7dfeb] border-t-[#18b866]" aria-hidden="true" />
        <div>
          <h2 className="text-[18px] leading-[1.25] font-bold text-[#070c11]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#667085]">{message}</p>
        </div>
      </div>
    </div>
  );
}
