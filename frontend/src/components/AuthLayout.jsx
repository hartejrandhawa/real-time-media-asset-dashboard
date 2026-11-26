import BrandMark from "./BrandMark";

export default function AuthLayout({ title, intro, children }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-stripe" aria-hidden="true" />
        <div className="auth-inner">
          <div className="brand brand-lg">
            <BrandMark size={26} />
            <span>Media Assets</span>
          </div>
          <h1>{title}</h1>
          {intro && <p className="auth-intro">{intro}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
