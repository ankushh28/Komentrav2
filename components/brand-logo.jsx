import Link from 'next/link';

export function BrandLogo({
  href,
  className = '',
  markClassName = 'h-9 w-9',
  textClassName = 'text-xl',
  showText = true,
}) {
  const content = (
    <>
      <img
        src="/logo-mark-128.png"
        alt="Komentra logo"
        width="36"
        height="36"
        className={`${markClassName} shrink-0 rounded-xl object-contain`}
      />
      {showText && (
        <span className={`${textClassName} min-w-0 truncate font-extrabold tracking-tight`}>
          Komentra
        </span>
      )}
    </>
  );

  const classes = `flex min-w-0 items-center gap-2 ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes} aria-label="Komentra home">
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}
