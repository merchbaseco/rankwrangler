import { Separator } from '@/components/ui/separator';
import { DebugToggle } from './components/debug-toggle';
import { Header } from './components/header';
import { License } from './components/license';

const Popup = () => {
    return (
        <div className="w-[340px] p-4">
            <Header />
            <div className="flex flex-col gap-3">
                <License />
                <Separator />
                <DebugToggle />
            </div>
        </div>
    );
};

export default Popup;
