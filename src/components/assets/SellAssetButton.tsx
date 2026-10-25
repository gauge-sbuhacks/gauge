import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
export function SellAssetButton({ id }: { id: string }) {
    return <Button variant="outline" size="sm" asChild><Link to={`/assets/${id}#sell`} onClick={e => e.stopPropagation()}>Sell <ArrowUpRight className="size-3.5" /></Link></Button>;
}
