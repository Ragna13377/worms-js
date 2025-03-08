export const checkEnvironment = () => {
	if (typeof window !== 'undefined') {
		console.log('Rendered on client');
	} else {
		console.log('Rendered on server');
	}
};
