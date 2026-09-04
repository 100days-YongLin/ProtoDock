const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const {
  GlassEaselMiniprogramWebpackPlugin,
  GlassEaselMiniprogramWxmlLoader,
  GlassEaselMiniprogramWxssLoader,
} = require('glass-easel-miniprogram-webpack-plugin');

module.exports = [
  {
    mode: 'production',
    entry: './src/index.js',
    output: {
      filename: 'index.js',
      path: path.join(__dirname, 'dist'),
      module: false,
      iife: true,
      library: {
        name: 'ProtoDockWechatBundle',
        type: 'window',
      },
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        'glass-easel': 'glass-easel',
      },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: 'ts-loader',
          options: {
            configFile: path.join(__dirname, 'tsconfig.json'),
            transpileOnly: true,
          },
          exclude: /node_modules/,
        },
        {
          test: /\.wxml$/,
          use: GlassEaselMiniprogramWxmlLoader,
          exclude: /node_modules/,
        },
        {
          test: /\.wxss$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            GlassEaselMiniprogramWxssLoader,
            'less-loader',
          ],
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: 'index.css' }),
      new GlassEaselMiniprogramWebpackPlugin({
        path: path.join(__dirname, 'src'),
        resourceFilePattern: /\.(?:avif|gif|html|jpe?g|mp3|mp4|ogg|png|svg|wav|webp)$/i,
        customBootstrap: true,
        tagNamePrefix: 'wx-',
      }),
    ],
  },
];
