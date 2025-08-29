
/**
 * Loading indicator component matching old extension's exact styling
 * Replicates .rw-container.rw-loading styles
 */
export function LoadingIndicator({ 
  message = 'Loading BSR...', 
  size = 'sm' 
}: {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div className="bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm animate-in fade-in duration-300 max-w-fit z-[1]">
      <div 
        className="w-3 h-3 border-[1.5px] border-gray-200 border-t-gray-800 rounded-full animate-spin flex-shrink-0"
        aria-hidden="true"
      />
      <span className="text-gray-800 text-sm font-medium">
        {message}
      </span>
    </div>
  );
}