# Contributing to vite-ssr-i18n-basic

Thank you for your interest in contributing to this project! 🎉

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Project Structure](#project-structure)

## 📜 Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vite-ssr-i18n-basic.git
   cd vite-ssr-i18n-basic
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start development server**:
   ```bash
   npm run dev
   ```

## 🛠️ Development Setup

### Prerequisites

- Node.js 22.12+
- npm or yarn
- Git

### Environment Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🔄 Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-new-locale-support`
- `fix/template-rendering-bug`
- `docs/update-readme`
- `refactor/plugin-architecture`

### Commit Messages

Follow conventional commits:
- `feat: add support for new locale`
- `fix: resolve template inheritance issue`
- `docs: update installation guide`
- `refactor: improve plugin performance`

### Types of Contributions

We welcome:
- 🐛 **Bug fixes**
- ✨ **New features**
- 📚 **Documentation improvements**
- 🎨 **UI/UX enhancements**
- ⚡ **Performance optimizations**
- 🧪 **Tests**

## 📤 Submitting Changes

1. **Create a new branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and test them:
   ```bash
   npm run dev    # Test in development
   npm run build  # Test production build
   ```

3. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request** on GitHub

### Pull Request Guidelines

- **Title**: Use a clear, descriptive title
- **Description**: Explain what changes you made and why
- **Testing**: Describe how you tested your changes
- **Screenshots**: Include before/after screenshots for UI changes
- **Breaking Changes**: Note any breaking changes

## 🎯 Coding Standards

### JavaScript/ES6+

- Use modern ES6+ features
- Prefer `const` and `let` over `var`
- Use arrow functions when appropriate
- Use template literals for string interpolation

### File Organization

```javascript
// Good: Clear imports and exports
import { resolve, join } from 'path'
import { readFileSync } from 'fs'

export function myFunction() {
  // Implementation
}
```

### Template Standards (Eta)

```html
<!-- Good: Clear template structure -->
<% layout('/layouts/main') %>

<h1><%= t('page.title') %></h1>
<p><%= t('page.description') %></p>
```

### Translation Files

```json
{
  "navigation": {
    "home": "Home",
    "about": "About"
  },
  "homepage": {
    "title": "Welcome",
    "subtitle": "A great site"
  }
}
```

## 🏗️ Project Structure

### Key Files

- `plugins/multi-locale-plugin.js` - Core plugin logic
- `vite.config.js` - Vite configuration
- `src/pages/` - Page templates
- `src/layouts/` - Layout templates
- `src/partials/` - Reusable components
- `src/data/` - Translation files

### Adding New Features

1. **Plugin Features**: Modify `plugins/multi-locale-plugin.js`
2. **Templates**: Add to `src/` directories
3. **Translations**: Update JSON files in `src/data/`
4. **Configuration**: Update `vite.config.js` if needed

## 🧪 Testing

### Manual Testing

```bash
# Test development mode
npm run dev
# Visit http://localhost:5173

# Test production build
npm run build
npm run preview
# Visit http://localhost:4173
```

### Test Checklist

- [ ] Development server starts without errors
- [ ] All locales generate correctly
- [ ] Templates render properly
- [ ] Language switching works
- [ ] Production build completes
- [ ] HTML is minified in production
- [ ] No JavaScript errors in console

## 🎨 Style Guide

### Code Formatting

We use Prettier for code formatting:
```bash
npm run format
```

### Documentation

- Use clear, descriptive comments
- Update README.md for new features
- Include examples in documentation
- Keep documentation up to date

## 🐛 Reporting Issues

When reporting issues, please include:

1. **Environment details**:
   - Node.js version
   - npm/yarn version
   - Operating system

2. **Steps to reproduce**
3. **Expected behavior**
4. **Actual behavior**
5. **Error messages** (if any)
6. **Screenshots** (if applicable)

## 💬 Getting Help

- **Issues**: [GitHub Issues](https://github.com/guilbep/vite-ssr-i18n-basic/issues)
- **Discussions**: [GitHub Discussions](https://github.com/guilbep/vite-ssr-i18n-basic/discussions)

## 📝 License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) that covers the project.

---

Thank you for contributing! 🙏
