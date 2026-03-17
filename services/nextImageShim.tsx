import React from 'react';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
};

const ImageShim = React.forwardRef<HTMLImageElement, Props>((props, ref) => {
  const { fill, style, ...rest } = props;
  if (fill) {
    return (
      <img
        ref={ref}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: (style as any)?.objectFit || 'cover',
          ...(style || {}),
        }}
        {...rest}
      />
    );
  }
  return <img ref={ref} style={style} {...rest} />;
});

ImageShim.displayName = 'NextImageShim';

export default ImageShim;
