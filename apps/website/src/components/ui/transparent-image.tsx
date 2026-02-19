import { useEffect, useRef, useState } from "react";

interface TransparentImageProps {
	src: string;
	alt: string;
	className?: string;
	/** How close to white a pixel must be to become transparent (0-255). Default 30. */
	threshold?: number;
}

/**
 * Renders an image with white background pixels replaced by transparency.
 * Loads the image into an offscreen canvas, scans pixels, and sets
 * near-white pixels to alpha 0 with a soft falloff edge.
 * Falls back to a regular <img> if canvas manipulation fails (e.g. CORS).
 */
export function TransparentImage({
	src,
	alt,
	className,
	threshold = 30,
}: TransparentImageProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [state, setState] = useState<"loading" | "canvas" | "fallback">(
		"loading",
	);

	useEffect(() => {
		setState("loading");
		const canvas = canvasRef.current;
		if (!canvas) return;

		const img = new Image();
		img.crossOrigin = "anonymous";

		img.onload = () => {
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;

			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) {
				setState("fallback");
				return;
			}

			ctx.drawImage(img, 0, 0);

			try {
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const { data } = imageData;
				const cutoff = 255 - threshold;

				for (let i = 0; i < data.length; i += 4) {
					const r = data[i];
					const g = data[i + 1];
					const b = data[i + 2];

					// If all channels are above cutoff, treat as white
					if (r > cutoff && g > cutoff && b > cutoff) {
						data[i + 3] = 0; // fully transparent
					} else {
						// Soft falloff: pixels close to white get partial transparency
						const brightness = (r + g + b) / 3;
						const fadeStart = cutoff - 20;
						if (
							brightness > fadeStart &&
							r > fadeStart &&
							g > fadeStart &&
							b > fadeStart
						) {
							const t = (brightness - fadeStart) / (255 - fadeStart);
							data[i + 3] = Math.round(255 * (1 - t));
						}
					}
				}

				ctx.putImageData(imageData, 0, 0);
				setState("canvas");
			} catch {
				// CORS or SecurityError — fall back to regular img
				setState("fallback");
			}
		};

		img.onerror = () => {
			setState("fallback");
		};

		img.src = src;
	}, [src, threshold]);

	if (state === "fallback") {
		return <img src={src} alt={alt} className={className} loading="lazy" />;
	}

	return (
		<canvas
			ref={canvasRef}
			aria-label={alt}
			role="img"
			className={className}
			style={{
				opacity: state === "canvas" ? 1 : 0,
				transition: "opacity 0.2s ease",
				objectFit: "contain",
			}}
		/>
	);
}
