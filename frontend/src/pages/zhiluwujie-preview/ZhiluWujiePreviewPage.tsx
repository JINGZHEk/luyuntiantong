import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ZhiluWujiePage from '@/pages/zhiluwujie/ZhiluWujiePage';
import type { SceneVisualPreset } from '@/pages/zhiluwujie/scene';
import styles from './ZhiluWujiePreviewPage.module.css';

type Skin = 'a' | 'b' | 'c';

const SKINS: Array<{
  id: Skin;
  label: string;
  detail: string;
  preset: Exclude<SceneVisualPreset, 'cyber'>;
}> = [
  { id: 'a', label: 'A', detail: '自然日间', preset: 'day' },
  { id: 'b', label: 'B', detail: '蓝调黄昏', preset: 'dusk' },
  { id: 'c', label: 'C', detail: '真实夜间', preset: 'night' },
];

function getSkin(value: string | null): Skin {
  return value === 'b' || value === 'c' ? value : 'a';
}

export default function ZhiluWujiePreviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [skin, setSkin] = useState<Skin>(() => getSkin(searchParams.get('skin')));

  const selectSkin = (next: Skin) => {
    setSkin(next);
    setSearchParams({ skin: next }, { replace: true });
  };

  const selected = SKINS.find((item) => item.id === skin) ?? SKINS[0];

  return (
    <main className={styles.previewRoot} data-ui-skin={skin}>
      <ZhiluWujiePage scenePreset={selected.preset} autoEnter />
      <div className={styles.previewToolbar} aria-label="大屏视觉预览控制">
        <span className={styles.previewLabel}>视觉预览</span>
        <span className={styles.previewRule} />
        {SKINS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.skinButton} ${skin === item.id ? styles.skinButtonActive : ''}`}
            onClick={() => selectSkin(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
        <span className={styles.previewHint}>同一数据与交互 / 真实 3D 光照与材质预览</span>
      </div>
    </main>
  );
}
