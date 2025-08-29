interface SearchBadgeProps {
    asin: string;
    state: 'loading' | 'success' | 'error' | 'no-data';
    bsr?: number;
}

export function SearchBadge({ asin, state, bsr }: SearchBadgeProps) {
    const baseStyles = "margin: 4px 0; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; backdrop-filter: blur(4px); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); max-width: fit-content; z-index: 1; position: relative;";

    if (state === 'loading') {
        return (
            <div 
                style={{
                    ...parseStyleString(baseStyles),
                    background: 'linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    color: 'rgb(37, 99, 235)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div 
                        style={{ 
                            width: '10px', 
                            height: '10px', 
                            border: '2px solid rgba(59, 130, 246, 0.3)', 
                            borderTopColor: 'rgb(59, 130, 246)', 
                            borderRadius: '50%', 
                            animation: 'spin 1s linear infinite' 
                        }} 
                    />
                    <span>Loading BSR...</span>
                </div>
            </div>
        );
    }

    if (state === 'success') {
        return (
            <div 
                style={{
                    ...parseStyleString(baseStyles),
                    background: 'linear-gradient(to right, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05))',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    color: 'rgb(21, 128, 61)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontWeight: '700' }}>#{bsr?.toLocaleString()}</span>
                    <span style={{ fontSize: '10px', opacity: '0.8' }}>BSR</span>
                </div>
            </div>
        );
    }

    if (state === 'no-data') {
        return (
            <div 
                style={{
                    ...parseStyleString(baseStyles),
                    background: 'linear-gradient(to right, rgba(156, 163, 175, 0.1), rgba(156, 163, 175, 0.05))',
                    border: '1px solid rgba(156, 163, 175, 0.2)',
                    color: 'rgb(75, 85, 99)'
                }}
            >
                <span>No BSR</span>
            </div>
        );
    }

    if (state === 'error') {
        return (
            <div 
                style={{
                    ...parseStyleString(baseStyles),
                    background: 'linear-gradient(to right, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: 'rgb(185, 28, 28)'
                }}
            >
                <span>Error</span>
            </div>
        );
    }

    return null;
}

function parseStyleString(styleString: string): React.CSSProperties {
    const styles: React.CSSProperties = {};
    const declarations = styleString.split(';').filter(decl => decl.trim());
    
    declarations.forEach(declaration => {
        const [property, value] = declaration.split(':').map(s => s.trim());
        if (property && value) {
            const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            styles[camelCaseProperty as keyof React.CSSProperties] = value as any;
        }
    });
    
    return styles;
}