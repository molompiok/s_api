export const getRandomPicsum = (width = 400, height = 400, index = Math.floor(Math.random() * 1000)) => {
  return `https://picsum.photos/${width}/${height}?random=${index}`
}