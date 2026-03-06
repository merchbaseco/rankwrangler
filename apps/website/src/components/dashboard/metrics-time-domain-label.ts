export const withTimeDomainLabel = (
	label: string,
	timeDomainLabel: string | undefined,
) => {
	if (timeDomainLabel === undefined || timeDomainLabel.trim().length === 0) {
		return label;
	}

	return `${label} (${timeDomainLabel})`;
};
