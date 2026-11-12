import { useEffect } from 'react';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanSyncStore } from '@/store/lanSyncStore';
import { useNodesStore } from '@/store/nodesStore';

/**
 * 全局同步请求确认框：同步服务由设置页开关控制，
 * 离开设置页后仍可能收到请求，所以监听与弹窗必须挂在应用根部。
 */
export function LanSyncRequestDialog() {
  const pending = useLanSyncStore((s) => s.pending);
  const accept = useLanSyncStore((s) => s.accept);
  const reject = useLanSyncStore((s) => s.reject);
  const bind = useLanSyncStore((s) => s.bind);
  const nodes = useNodesStore((s) => s.nodes);

  useEffect(() => {
    const unlisten = bind();
    return () => { void unlisten.then((fn) => fn()); };
  }, [bind]);

  return (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) void reject(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            {pending ? `${pending.from.name} 请求同步` : '同步请求'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? `将发送 ${pending.nodes.length} 个节点，并接收本机的 ${nodes.length} 个节点。本机密钥、禁用状态与分组不会被改动。`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => void reject()}>拒绝</Button>
          <Button onClick={() => void accept()}>确认同步</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
