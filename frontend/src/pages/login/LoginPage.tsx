import React, { FormEvent, useEffect, useState } from 'react';
import { EyeInvisibleOutlined, EyeOutlined, LockOutlined, LoginOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEMO_ACCOUNT, getAuthSession, signIn } from '@/services/auth';
import styles from './LoginPage.module.css';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (getAuthSession()) navigate('/', { replace: true });
  }, [navigate]);

  const requestedDestination = new URLSearchParams(location.search).get('redirect');
  const destination = requestedDestination?.startsWith('/') ? requestedDestination : '/';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setIsSubmitting(true);
    window.setTimeout(() => {
      if (signIn(username, password, remember)) {
        navigate(destination, { replace: true });
      } else {
        setError('账号或密码不正确，请使用演示账号登录');
        setIsSubmitting(false);
      }
    }, 420);
  };

  const useDemoAccount = () => {
    setUsername(DEMO_ACCOUNT.username);
    setPassword(DEMO_ACCOUNT.password);
    setError('');
  };

  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={`${styles.ambient} ${styles.ambientTop}`} aria-hidden="true" />
      <div className={`${styles.ambient} ${styles.ambientBottom}`} aria-hidden="true" />

      <section className={styles.brandPanel} aria-label="路云天瞳产品信息">
        <div className={styles.brandLockup}>
          <img src="/brand-mark.svg" alt="" className={styles.logo} />
          <div>
            <div className={styles.brandName}>路云天瞳</div>
            <div className={styles.brandSubtitle}>V2X DIGITAL TWIN</div>
          </div>
        </div>

        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span /> CLOUD CONTROL CENTER</div>
          <h1>让每一次<br /><em>看不见</em>的风险<br />都被提前看见。</h1>
          <p>路侧感知 · 时空推理 · 协同决策</p>
        </div>

        <div className={styles.signalPanel}>
          <div className={styles.signalHeader}>
            <span>NETWORK STATUS</span>
            <span className={styles.online}><i /> OPERATIONAL</span>
          </div>
          <div className={styles.signalLine}><span /><span /><span /><span /><span /><span /><span /></div>
          <div className={styles.signalMeta}><span>EDGE NODES <b>04</b></span><span>STREAM RATE <b>10Hz</b></span><span>UPTIME <b>99.98%</b></span></div>
        </div>

        <div className={styles.footerNote}>© 2026 路云天瞳 · 智慧道路感知平台</div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formShell}>
          <div className={styles.formHeader}>
            <div className={styles.formKicker}>SECURE ACCESS <span>01</span></div>
            <h2>欢迎回来</h2>
            <p>登录云端控制台，继续监测路口态势。</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <label className={styles.fieldLabel} htmlFor="login-username">账号</label>
            <div className={styles.inputWrap}>
              <UserOutlined aria-hidden="true" />
              <input id="login-username" autoComplete="username" placeholder="请输入账号" value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>

            <div className={styles.passwordLabelRow}>
              <label className={styles.fieldLabel} htmlFor="login-password">密码</label>
              <button type="button" className={styles.textButton} onClick={useDemoAccount}>填入演示账号</button>
            </div>
            <div className={styles.inputWrap}>
              <LockOutlined aria-hidden="true" />
              <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="请输入密码" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" className={styles.iconButton} aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </button>
            </div>

            <div className={styles.formOptions}>
              <label className={styles.checkboxLabel}><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>保持登录状态</span></label>
              <span className={styles.secureHint}>TLS 1.3 · 加密连接</span>
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}
            <button type="submit" className={styles.submit} disabled={isSubmitting}>
              <span>{isSubmitting ? '正在验证...' : '进入控制台'}</span>
              {!isSubmitting && <LoginOutlined aria-hidden="true" />}
            </button>
          </form>

          <div className={styles.formDivider}><span>AUTHORIZED PERSONNEL ONLY</span></div>
          <div className={styles.demoCard}>
            <div className={styles.demoIcon}>⌁</div>
            <div><strong>评审演示通道</strong><span>使用“填入演示账号”即可体验完整控制台</span></div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
