import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StatsDisplay from './components/stats-display';
import LicenseSection from './components/license-section';

const Popup = () => {
    return (
        <Card className="w-96">
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between">
                    <img
                        src="images/logo.png"
                        alt="RankWrangler"
                        className="h-8 w-auto object-contain drop-shadow-sm"
                    />
                </CardTitle>
                <CardDescription>Amazon BSR tracker and analyzer</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <StatsDisplay />
                <LicenseSection />
            </CardContent>
        </Card>
    );
};

export default Popup;