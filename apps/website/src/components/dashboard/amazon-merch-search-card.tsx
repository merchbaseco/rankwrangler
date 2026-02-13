import { useState, type FormEvent } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buildAmazonMerchShirtSearchUrl } from '@/lib/amazon-merch-search';

export function AmazonMerchSearchCard() {
    const [keyword, setKeyword] = useState('');

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const searchUrl = buildAmazonMerchShirtSearchUrl(keyword);
        window.open(searchUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <Card>
            <CardHeader>
                <div className="space-y-1">
                    <CardTitle>Merch Shirt Search</CardTitle>
                    <CardDescription>
                        Open Amazon in a new tab with Merch by Amazon shirt filters pre-applied.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <Input
                        type="search"
                        value={keyword}
                        onChange={event => setKeyword(event.target.value)}
                        placeholder="Enter keyword (example: heart health awareness)"
                        aria-label="Merch by Amazon keyword"
                    />
                    <CardDescription>
                        Leave blank to browse all Merch by Amazon shirts.
                    </CardDescription>
                    <Button className="w-full sm:w-auto" type="submit">
                        <Search className="h-4 w-4" />
                        Search Amazon
                    </Button>
                </form>
            </CardContent>
            <CardFooter>
                <CardDescription className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Uses <code className="font-mono">hidden-keywords</code> plus merch-specific shirt
                    filters.
                </CardDescription>
            </CardFooter>
        </Card>
    );
}
