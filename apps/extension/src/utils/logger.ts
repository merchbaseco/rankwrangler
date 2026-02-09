import { createConsola } from "consola";

const logger = createConsola({
	formatOptions: {
		compact: false,
		date: true,
		columns: 80,
		colors: true,
	},
	fancy: true,
}).withTag("🤠 RankWrangler");

export const log = {
	// Standard levels with colors
	info: (message: string | object, data?: object) => logger.info(message, data),
	error: (message: string | object, data?: object) =>
		logger.error(message, data),
	debug: (message: string | object, data?: object) =>
		logger.debug(message, data),
	warn: (message: string | object, data?: object) => logger.warn(message, data),
	success: (message: string | object, data?: object) =>
		logger.success(message, data),
	fail: (message: string | object, data?: object) => logger.fail(message, data),

	// Special formatting methods
	box: (message: string) => logger.box(message),
	start: (message: string) => logger.start(message),
	ready: (message: string) => logger.ready(message),

	// Create sub-logger with additional tag
	withTag: (tag: string) => {
		const subLogger = logger.withTag(tag);
		return {
			info: (message: string | object, data?: object) =>
				subLogger.info(message, data),
			error: (message: string | object, data?: object) =>
				subLogger.error(message, data),
			debug: (message: string | object, data?: object) =>
				subLogger.debug(message, data),
			warn: (message: string | object, data?: object) =>
				subLogger.warn(message, data),
			success: (message: string | object, data?: object) =>
				subLogger.success(message, data),
			fail: (message: string | object, data?: object) =>
				subLogger.fail(message, data),
			box: (message: string) => subLogger.box(message),
			start: (message: string) => subLogger.start(message),
			ready: (message: string) => subLogger.ready(message),
		};
	},
};

export default log;
