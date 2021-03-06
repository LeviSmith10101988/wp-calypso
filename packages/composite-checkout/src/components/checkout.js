/**
 * External dependencies
 */
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import styled from '@emotion/styled';
import debugFactory from 'debug';

/**
 * Internal dependencies
 */
import joinClasses from '../lib/join-classes';
import { useLocalize, sprintf } from '../lib/localize';
import CheckoutStep from './checkout-step';
import CheckoutNextStepButton from './checkout-next-step-button';
import CheckoutSubmitButton from './checkout-submit-button';
import LoadingContent from './loading-content';
import {
	usePrimarySelect,
	usePrimaryDispatch,
	useRegisterPrimaryStore,
	usePaymentData,
	useRegistry,
} from '../lib/registry';
import CheckoutErrorBoundary from './checkout-error-boundary';
import { useActiveStep, ActiveStepProvider, RenderedStepProvider } from '../lib/active-step';
import { usePaymentMethod } from '../lib/payment-methods';
import {
	getDefaultOrderSummaryStep,
	getDefaultPaymentMethodStep,
	getDefaultOrderReviewStep,
} from './default-steps';
import { validateSteps } from '../lib/validation';
import { useEvents } from './checkout-provider';
import { useFormStatus } from '../lib/form-status';

const debug = debugFactory( 'composite-checkout:checkout' );

function useRegisterCheckoutStore() {
	const onEvent = useEvents();
	useRegisterPrimaryStore( {
		reducer( state = { stepNumber: getStepNumberFromUrl(), paymentData: {} }, action ) {
			switch ( action.type ) {
				case 'STEP_NUMBER_SET':
					return { ...state, stepNumber: action.payload };
				case 'PAYMENT_DATA_UPDATE':
					return {
						...state,
						paymentData: { ...state.paymentData, [ action.payload.key ]: action.payload.value },
					};
			}
			return state;
		},
		actions: {
			*changeStep( payload ) {
				yield { type: 'STEP_NUMBER_CHANGE_EVENT', payload };
				return { type: 'STEP_NUMBER_SET', payload };
			},
			updatePaymentData( key, value ) {
				return { type: 'PAYMENT_DATA_UPDATE', payload: { key, value } };
			},
		},
		controls: {
			STEP_NUMBER_CHANGE_EVENT( action ) {
				onEvent( action );
				saveStepNumberToUrl( action.payload );
			},
		},
		selectors: {
			getStepNumber( state ) {
				return state.stepNumber;
			},
			getPaymentData( state ) {
				return state.paymentData;
			},
		},
	} );
}

export default function Checkout( { steps, className } ) {
	useRegisterCheckoutStore();
	const localize = useLocalize();
	const [ paymentData ] = usePaymentData();
	const activePaymentMethod = usePaymentMethod();
	const [ formStatus ] = useFormStatus();

	// Re-render if any store changes; that way isComplete can rely on any data
	useRenderOnStoreUpdate();

	// stepNumber is the displayed number of the active step, not its index
	const stepNumber = usePrimarySelect( select => select().getStepNumber() );
	debug( 'current step number is', stepNumber );
	const { changeStep } = usePrimaryDispatch();
	steps = steps || makeDefaultSteps( localize );
	validateSteps( steps );

	// Change the step if the url changes
	useChangeStepNumberForUrl();

	// Assign step numbers to all steps with numbers
	let numberedStepNumber = 0;
	let annotatedSteps = steps.map( ( step, index ) => {
		numberedStepNumber = step.hasStepNumber ? numberedStepNumber + 1 : numberedStepNumber;
		return {
			...step,
			stepNumber: step.hasStepNumber ? numberedStepNumber : null,
			stepIndex: index,
		};
	} );
	if ( annotatedSteps.length < 1 ) {
		throw new Error( 'No steps found' );
	}

	const activeStep = annotatedSteps.find( step => step.stepNumber === stepNumber );
	if ( ! activeStep ) {
		throw new Error( 'There is no active step' );
	}

	// Assign isComplete separately so we can provide the activeStep
	annotatedSteps = annotatedSteps.map( step => {
		return {
			...step,
			isComplete:
				!! step.isCompleteCallback &&
				step.isCompleteCallback( { paymentData, activeStep, activePaymentMethod } ),
		};
	} );

	const nextStep = annotatedSteps.find( ( step, index ) => {
		return index > activeStep.stepIndex && step.hasStepNumber;
	} );
	const isThereAnotherNumberedStep = !! nextStep && nextStep.hasStepNumber;
	const isThereAnIncompleteStep = !! annotatedSteps.find( step => ! step.isComplete );
	const isCheckoutInProgress =
		isThereAnIncompleteStep || isThereAnotherNumberedStep || formStatus !== 'ready';

	if ( formStatus === 'loading' ) {
		return (
			<Container className={ joinClasses( [ className, 'composite-checkout' ] ) }>
				<MainContent
					className={ joinClasses( [ className, 'checkout__content' ] ) }
					isCheckoutInProgress={ isCheckoutInProgress }
				>
					<LoadingContent />
				</MainContent>
			</Container>
		);
	}

	return (
		<Container className={ joinClasses( [ className, 'composite-checkout' ] ) }>
			<MainContent
				className={ joinClasses( [ className, 'checkout__content' ] ) }
				isCheckoutInProgress={ isCheckoutInProgress }
			>
				<ActiveStepProvider step={ activeStep }>
					{ annotatedSteps.map( step => (
						<CheckoutStepContainer
							{ ...step }
							key={ step.id }
							stepNumber={ step.stepNumber || null }
							shouldShowNextButton={
								step.hasStepNumber && step.id === activeStep.id && isThereAnotherNumberedStep
							}
							goToNextStep={ () => changeStep( nextStep.stepNumber ) }
							onEdit={
								step.id !== activeStep.id &&
								step.hasStepNumber &&
								step.isEditableCallback &&
								step.isEditableCallback( { paymentData } )
									? () => changeStep( step.stepNumber )
									: null
							}
						/>
					) ) }
				</ActiveStepProvider>

				<CheckoutWrapper isCheckoutInProgress={ isCheckoutInProgress }>
					<CheckoutErrorBoundary
						errorMessage={ localize( 'There was a problem with the submit button.' ) }
					>
						<CheckoutSubmitButton disabled={ isCheckoutInProgress } />
					</CheckoutErrorBoundary>
				</CheckoutWrapper>
			</MainContent>
		</Container>
	);
}

Checkout.propTypes = {
	className: PropTypes.string,
	steps: PropTypes.array,
};

function CheckoutStepContainer( {
	id,
	titleContent,
	className,
	activeStepContent,
	incompleteStepContent,
	completeStepContent,
	stepNumber,
	shouldShowNextButton,
	goToNextStep,
	getNextStepButtonAriaLabel,
	onEdit,
	getEditButtonAriaLabel,
	isComplete,
} ) {
	const localize = useLocalize();
	const currentStep = useActiveStep();
	const isActive = currentStep.id === id;

	return (
		<CheckoutErrorBoundary
			errorMessage={ sprintf( localize( 'There was a problem with the step "%s".' ), id ) }
		>
			<RenderedStepProvider stepId={ id }>
				<CheckoutStep
					id={ id }
					className={ className }
					isActive={ isActive }
					isComplete={ isComplete }
					stepNumber={ stepNumber }
					title={ titleContent || '' }
					onEdit={ onEdit }
					editButtonAriaLabel={ getEditButtonAriaLabel && getEditButtonAriaLabel() }
					stepContent={
						<React.Fragment>
							{ activeStepContent }
							{ shouldShowNextButton && (
								<CheckoutNextStepButton
									value={ localize( 'Continue' ) }
									onClick={ goToNextStep }
									ariaLabel={ getNextStepButtonAriaLabel && getNextStepButtonAriaLabel() }
									buttonState={ ! isComplete ? 'disabled' : 'primary' }
									disabled={ ! isComplete }
								/>
							) }
						</React.Fragment>
					}
					stepSummary={ isComplete ? completeStepContent : incompleteStepContent }
				/>
			</RenderedStepProvider>
		</CheckoutErrorBoundary>
	);
}

const Container = styled.div`
	*:focus {
		outline: ${props => props.theme.colors.outline} solid 2px;
	}
`;

const MainContent = styled.div`
	background: ${props => props.theme.colors.surface};
	width: 100%;
	box-sizing: border-box;
	margin-bottom: ${props => ( props.isCheckoutInProgress ? 0 : '89px' )};

	@media ( ${props => props.theme.breakpoints.tabletUp} ) {
		border: 1px solid ${props => props.theme.colors.borderColorLight};
		margin: 32px auto;
		box-sizing: border-box;
		max-width: 556px;
	}
`;

const CheckoutWrapper = styled.div`
	background: ${props => props.theme.colors.background};
	padding: 24px;
	position: ${props => ( props.isCheckoutInProgress ? 'relative' : 'fixed' )};
	bottom: 0;
	left: 0;
	box-sizing: border-box;
	width: 100%;
	z-index: 10;
	border-top-width: ${props => ( props.isCheckoutInProgress ? '0' : '1px' )};
	border-top-style: solid;
	border-top-color: ${props => props.theme.colors.borderColorLight};

	@media ( ${props => props.theme.breakpoints.tabletUp} ) {
		position: relative;
		border: 0;
	}
`;

function makeDefaultSteps( localize ) {
	return [
		getDefaultOrderSummaryStep(),
		{
			...getDefaultPaymentMethodStep(),
			getEditButtonAriaLabel: () => localize( 'Edit the payment method' ),
			getNextStepButtonAriaLabel: () => localize( 'Continue with the selected payment method' ),
		},
		getDefaultOrderReviewStep(),
	];
}

function useRenderOnStoreUpdate() {
	const { subscribe } = useRegistry();
	const [ , setForceReload ] = useState( 0 );
	useEffect( () => {
		return subscribe( () => {
			setForceReload( current => current + 1 );
		} );
	}, [ subscribe ] );
}

function getStepNumberFromUrl() {
	const hashValue = window.location?.hash;
	if ( hashValue?.startsWith?.( '#step' ) ) {
		const parts = hashValue.split( '#step' );
		const stepNumber = parts.length > 1 ? parts[ 1 ] : 1;
		debug( 'found step number in url', stepNumber );
		return parseInt( stepNumber, 10 );
	}
	return 1;
}

function saveStepNumberToUrl( stepNumber ) {
	if ( ! window.history?.pushState ) {
		return;
	}
	const newHash = `#step${ stepNumber }`;
	if ( window.location.hash === newHash ) {
		return;
	}
	const newUrl = window.location.hash
		? window.location.href.replace( window.location.hash, newHash )
		: window.location.href + newHash;
	debug( 'updating url to', newUrl );
	window.history.pushState( null, null, newUrl );
}

function useChangeStepNumberForUrl() {
	const { changeStep } = usePrimaryDispatch();
	useEffect( () => {
		let isSubscribed = true;
		window.addEventListener?.( 'hashchange', function() {
			const newStepNumber = getStepNumberFromUrl();
			debug( 'step number in url changed to', newStepNumber );
			isSubscribed && changeStep( newStepNumber );
		} );
		return () => ( isSubscribed = false );
	}, [ changeStep ] );
}
