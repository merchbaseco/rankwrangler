import { Alert, Spinner } from '@heroui/react';

/** Loading and failure for a metrics page whose whole body comes from one read. */
export const MetricsState = ({ error, label }: { error: boolean; label: string }) =>
    error ? (
        <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{label} did not load</Alert.Title>
                <Alert.Description>
                    The server did not answer; it retries every 10 seconds.
                </Alert.Description>
            </Alert.Content>
        </Alert>
    ) : (
        <div aria-busy="true" className="flex min-h-24 items-center justify-center">
            <Spinner size="sm" />
        </div>
    );
