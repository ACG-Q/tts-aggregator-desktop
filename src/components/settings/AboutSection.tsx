import { useEffect, useState } from 'react';
import { ExternalLink, Headphones, Radio, ShieldCheck } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SetCard, SetRow } from '@/components/settings/SetBits';
import { useNodesStore } from '@/store/nodesStore';
import { useVoicesStore } from '@/store/voicesStore';
import pkg from '../../../package.json';

const REPO = 'https://github.com/ACG-Q/tts-aggregator-desktop';

export function AboutSection() {
  const [version, setVersion] = useState(pkg.version);
  const nodeCount = useNodesStore((s) => s.nodes.length);
  const voiceCount = useVoicesStore((s) => s.voices.length);

  useEffect(() => {
    let alive = true;
    getVersion()
      .then((v) => { if (alive) setVersion(v); })
      .catch((e: unknown) => console.warn('读取应用版本失败，使用 package.json 版本', e));
    return () => { alive = false; };
  }, []);

  async function openLink(url: string): Promise<void> {
    try {
      await openUrl(url);
    } catch (e) {
      toast.error(`无法打开链接：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">关于</h2>
        <p className="mt-1 text-[11.5px] text-muted-foreground">版本信息、项目地址与运行环境。</p>
      </div>

      <div className="mb-3.5 flex items-center gap-4 rounded-[13px] border border-line bg-card px-[18px] py-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] border border-primary/25 bg-primary/10 text-primary">
          <Headphones className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-[17px] font-semibold tracking-tight">TTS Aggregator</h3>
            <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground num">
              v{version}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Pulse 桌面端 · 把文字交给声音的本地朗读工作台
          </p>
          <p className="mt-1.5 text-[11px] text-faint">
            聚合多个自建 TTS 节点，自动挑选可用线路，支持长文朗读与小说听书。
          </p>
        </div>
      </div>

      <SetCard title="项目">
        <SetRow
          title="源码仓库"
          desc="GitHub 上的 Pulse 桌面端仓库，包含完整实现与设计文档。"
          control={(
            <Button variant="outline" onClick={() => void openLink(REPO)}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              打开仓库
            </Button>
          )}
        />
        <SetRow
          title="版本发布"
          desc="下载 Windows 安装包与 SHA-256 校验文件，查看每次变更。"
          control={(
            <Button variant="outline" onClick={() => void openLink(`${REPO}/releases`)}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              查看 Release
            </Button>
          )}
        />
        <SetRow
          title="问题反馈"
          desc="遇到 bug 或有功能建议时，可以在 Issues 中提交。"
          control={(
            <Button variant="outline" onClick={() => void openLink(`${REPO}/issues`)}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              提交反馈
            </Button>
          )}
        />
      </SetCard>

      <SetCard title="运行时">
        <SetRow
          title="技术栈"
          desc="Tauri 2 + React 19 + TypeScript + Vite + SQLite，界面使用 Tailwind CSS。"
          control={<span className="text-[11px] text-muted-foreground">Tauri 2</span>}
        />
        <SetRow
          title="当前数据"
          desc={`已添加 ${nodeCount} 个节点，载入 ${voiceCount} 个音色。`}
          control={<span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Radio className="h-3.5 w-3.5" />本机</span>}
        />
        <SetRow
          title="数据存放"
          desc="节点、日志、设置与书籍保存在本机 SQLite；Windows 下位于 %APPDATA%\com.liuji.tmp-desktop。"
          control={<span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />仅本机</span>}
        />
        <SetRow
          title="构建状态"
          desc="当前安装包未做代码签名，首次运行可能触发系统安全提示。"
          control={<span className="text-[11px] text-muted-foreground">未签名</span>}
        />
      </SetCard>

      <p className="mt-4 px-1 text-[10.5px] leading-relaxed text-faint">
        朗读文本只在本机与所选节点之间传输；API Key、调用记录与导入内容均保存在本机，不会上传到其他服务器。
      </p>
    </section>
  );
}
