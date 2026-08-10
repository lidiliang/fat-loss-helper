import sharp from 'sharp';

await Promise.all([
  sharp('assets/brand-icon.svg').resize(1024, 1024).png().toFile('assets/icon.png'),
  sharp('assets/brand-icon.svg').resize(512, 512).png().toFile('assets/splash-icon.png'),
  sharp('assets/brand-icon.svg').resize(64, 64).png().toFile('assets/favicon.png'),
  sharp('assets/android-icon-foreground.svg').resize(1024, 1024).png().toFile('assets/android-icon-foreground.png'),
  sharp('assets/android-icon-foreground.svg').resize(432, 432).grayscale().png().toFile('assets/android-icon-monochrome.png'),
]);

console.log('Brand assets rendered.');
