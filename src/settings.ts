export const profile = {
	fullName: 'Pierre Beckmann', // Replace with your full name
	title: 'PhD Student', // e.g., "PhD Student", "Research Scientist", "Professor"
	institute: 'EPFL and IDIAP', // e.g., "University of Example"
	author_name: 'Pierre Beckmann', // Author name to be highlighted in the papers section
	bio: 'I am a researcher working in Philosophy of AI and Philosophically-motivated AI. I am currently a PhD student in the <a href="https://www.idiap.ch/en/scientific-research/neuro-symbolic-ai" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">Neuro-Symbolic AI group</a> of Idiap and EPFL, working for the <a href="https://www.dsi.uzh.ch/en/research/projects/third-party/m-rational.html" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">M-RATIONAL project</a>. I also keep close ties to the institute for philosophy of Bern where I worked as a research assistant.',
	research_areas: [
		// Add your research areas here, for example:
		// { title: 'Machine Learning', description: 'Deep learning and neural networks', field: 'computer-science' },
		// { title: 'Astrophysics', description: 'Galaxy formation and evolution', field: 'physics' },
	],
}

// Set equal to an empty string to hide the icon that you don't want to display
export const social = {
	email: 'pierrebeckmann@gmail.com', // Your email address
	linkedin: '', // Hidden - set to empty string
	x: 'https://x.com/BeckmannPierre', // Your X (Twitter) profile URL
	github: '', // Hidden - set to empty string
	gitlab: '', // Hidden - set to empty string
	scholar: 'https://scholar.google.com/citations?user=N8AW7IgAAAAJ&hl', // Your Google Scholar profile URL
	inspire: '', // Hidden - set to empty string
	arxiv: '', // Hidden - set to empty string
	orcid: 'https://orcid.org/0000-0001-9247-4841', // Your ORCID profile URL
}

export const template = {
	website_url: 'https://bepierre.github.io', // Change this to your actual domain when deploying
	menu_left: false, // Set to true if you want left-aligned menu
	transitions: true, // Enable page transitions
	lightTheme: 'light', // DaisyUI light theme
	darkTheme: 'dark', // DaisyUI dark theme
	excerptLength: 200, // Length of blog post excerpts
	postPerPage: 5, // Number of blog posts per page
    	base: '/pierre-beckmann-website/' // Replace REPOSITORY_NAME with your actual repository name
}

export const seo = {
	default_title: 'Pierre Beckmann', // Your website titlee 
	default_description: '', // Your website description
	default_image: '', // Add your own image here
}
