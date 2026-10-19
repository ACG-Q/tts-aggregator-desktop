import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PlayerControls } from '@/components/player/PlayerControls';
import { SegmentList } from '@/components/player/SegmentList';
import { readTextFile } from '@/lib/encoding';
import { voiceDisplayName } from '@/lib/voices';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';

export function ReadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const player = usePlayerStore();
  const { synth, saveSynth } = useSettingsStore();
  const { voices, load } = useVoicesStore();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">朗读</h1>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Textarea
            rows={8}
            placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
            value={player.text}
            onChange={(e) => player.setText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" />
              导入 TXT
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) player.setText(await readTextFile(file));
                e.target.value = '';
              }}
            />
            <div className="grow" />
            <span className="text-sm text-muted-foreground">{player.text.length} 字</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">合成参数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">音色</Label>
              <Select
                value={synth.voice || 'node-default'}
                onOpenChange={(open) => { if (open) void load(); }}
                onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="节点默认音色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="node-default">节点默认音色</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {voiceDisplayName(v)}（{v.id}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">语速 {synth.rate}</Label>
              <Slider
                value={[synth.rate]} min={-100} max={100} step={1}
                onValueChange={([v]) => void saveSynth({ ...synth, rate: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">音调 {synth.pitch}</Label>
              <Slider
                value={[synth.pitch]} min={-100} max={100} step={1}
                onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <PlayerControls onStart={() => void player.start(player.text)} startDisabled={!player.text.trim()} />
        </CardContent>
      </Card>

      {player.segs.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <SegmentList />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
