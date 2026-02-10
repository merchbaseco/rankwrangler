import { Card, CardDescription, CardPanel, CardTitle } from '@/components/ui/card';

interface UsageStatProps {
    label: string;
    value: string;
    helper?: string;
}

export function UsageStat({ label, value, helper }: UsageStatProps) {
    return (
        <Card>
            <CardPanel>
                <div className="space-y-2">
                    <CardDescription>{label}</CardDescription>
                    <CardTitle>{value}</CardTitle>
                    {helper && <CardDescription>{helper}</CardDescription>}
                </div>
            </CardPanel>
        </Card>
    );
}
